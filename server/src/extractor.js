import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const EMAIL_RE = /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/;

function normalizeEmail(e) {
  return (e || '').trim().toLowerCase();
}

function cleanName(name) {
  if (!name) return '';
  let n = String(name).trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
  if (EMAIL_RE.test(n)) return '';
  return n;
}

function parseAddressList(field) {
  if (!field) return [];
  const list = Array.isArray(field) ? field : [field];
  const out = [];
  for (const item of list) {
    if (!item) continue;
    if (Array.isArray(item.value)) {
      for (const a of item.value) {
        const email = normalizeEmail(a.address);
        if (email && EMAIL_RE.test(email)) out.push({ email, name: cleanName(a.name) });
      }
    } else if (typeof item === 'string') {
      const m = item.match(/"?([^"<]*)"?\s*<([^>]+)>/);
      if (m) {
        const email = normalizeEmail(m[2]);
        if (EMAIL_RE.test(email)) out.push({ email, name: cleanName(m[1]) });
      } else {
        const email = normalizeEmail(item);
        if (EMAIL_RE.test(email)) out.push({ email, name: '' });
      }
    }
  }
  return out;
}

function addressesFromMessage(parsed, direction) {
  // Emit every address we can see and label its role so a single message
  // yields both the sender AND the other recipients of the same thread.
  const out = [];
  const push = (list, role) => {
    for (const a of parseAddressList(list)) out.push({ ...a, role });
  };
  if (direction === 'inbox') {
    push(parsed.from, 'inbox');
    push(parsed.replyTo, 'inbox');
    push(parsed.sender, 'inbox');
    // Other people copied on a message we received → still useful as contacts
    push(parsed.to, 'mentioned');
    push(parsed.cc, 'mentioned');
  } else {
    push(parsed.to, 'sent');
    push(parsed.cc, 'sent');
    push(parsed.bcc, 'sent');
    // Sometimes `From` on sent items is us; sometimes forwarded from someone else
    push(parsed.from, 'inbox');
  }
  return out;
}

const EMAIL_GLOBAL = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const MAILTO_RE = /mailto:([^\s"'>)]+)/gi;

function extractFromBody(text) {
  if (!text || typeof text !== 'string') return [];
  const found = new Map();
  const add = email => {
    const e = email.trim().toLowerCase().replace(/[,;.]+$/, '');
    if (EMAIL_RE.test(e) && !found.has(e)) found.set(e, { email: e, name: '', role: 'mentioned' });
  };
  let m;
  while ((m = MAILTO_RE.exec(text)) !== null) add(decodeURIComponent(m[1].split('?')[0]));
  const capped = text.slice(0, 50_000);
  while ((m = EMAIL_GLOBAL.exec(capped)) !== null) add(m[1]);
  return Array.from(found.values());
}

function passesFilters(addr, filters, ownerEmail) {
  const email = addr.email;
  if (!email || email === ownerEmail) return false;
  if (filters.excludeDomains?.length) {
    const domain = email.split('@')[1];
    if (filters.excludeDomains.some(d => domain === d || domain.endsWith('.' + d))) return false;
  }
  if (filters.excludeNoReply && /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|notification|bounce|alerts?)@/i.test(email)) {
    return false;
  }
  if (filters.requireName && !addr.name) return false;
  return true;
}

function mergeContact(map, addr, date, subject, source = 'message') {
  const key = addr.email;
  const role = addr.role || 'inbox';
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      email: key,
      names: addr.name ? [addr.name] : [],
      count: 1,
      sentCount: role === 'sent' ? 1 : 0,
      receivedCount: role === 'inbox' ? 1 : 0,
      mentionedCount: role === 'mentioned' ? 1 : 0,
      firstSeen: date || null,
      lastSeen: date || null,
      lastSubject: subject || '',
      sources: new Set([source])
    });
    return;
  }
  existing.count++;
  if (role === 'sent') existing.sentCount++;
  else if (role === 'inbox') existing.receivedCount++;
  else if (role === 'mentioned') existing.mentionedCount++;
  if (addr.name && !existing.names.includes(addr.name)) existing.names.push(addr.name);
  existing.sources.add(source);
  if (date) {
    if (!existing.firstSeen || date < existing.firstSeen) existing.firstSeen = date;
    if (!existing.lastSeen || date > existing.lastSeen) {
      existing.lastSeen = date;
      existing.lastSubject = subject || existing.lastSubject;
    }
  }
}

function bestName(names) {
  if (!names.length) return '';
  return names.slice().sort((a, b) => b.length - a.length)[0];
}

const SENT_CANDIDATES = [
  'Sent', 'Sent Mail', 'Sent Items', 'Sent Messages',
  '[Gmail]/Sent Mail', '[Google Mail]/Sent Mail',
  'INBOX.Sent', 'INBOX/Sent', 'INBOX.Sent Items', 'INBOX.Sent Messages'
];
const INBOX_CANDIDATES = ['INBOX', 'Inbox', 'inbox'];

async function listMailboxes(client) {
  try { return await client.list(); } catch { return []; }
}

function findBySpecialUse(mailboxes, flag) {
  const want = flag.toLowerCase();
  return mailboxes.find(m => (m.specialUse || '').toLowerCase() === want);
}

function findByName(mailboxes, candidates) {
  const lowered = mailboxes.map(m => ({ raw: m, key: (m.path || '').toLowerCase() }));
  for (const cand of candidates) {
    const hit = lowered.find(x => x.key === cand.toLowerCase());
    if (hit) return hit.raw;
  }
  return null;
}

function resolveFolder(mailboxes, direction, preferredPath) {
  if (preferredPath) {
    const exact = mailboxes.find(m => m.path === preferredPath);
    if (exact) return exact.path;
    const ci = mailboxes.find(m => m.path.toLowerCase() === preferredPath.toLowerCase());
    if (ci) return ci.path;
  }
  if (direction === 'inbox') {
    const inboxFlag = findBySpecialUse(mailboxes, '\\Inbox');
    if (inboxFlag) return inboxFlag.path;
    const byName = findByName(mailboxes, INBOX_CANDIDATES);
    if (byName) return byName.path;
    return 'INBOX';
  }
  const sentFlag = findBySpecialUse(mailboxes, '\\Sent');
  if (sentFlag) return sentFlag.path;
  const byName = findByName(mailboxes, SENT_CANDIDATES);
  if (byName) return byName.path;
  return null;
}

function classifyError(err) {
  const raw = err?.message || String(err || '');
  const code = err?.code || err?.authenticationFailed && 'AUTH' || '';
  const low = raw.toLowerCase();

  if (/blacklisted|blacklist|too many (failed )?(login|auth)|rate.?limit|try again later/i.test(raw)) {
    return 'Your IP is temporarily blocked by the mail server after too many failed login attempts. Wait 30–60 minutes, verify the password works in the provider web UI, then try again (optionally from a different network / VPN).';
  }
  if (/log ?in via (your )?browser|web ?login required|please log in (to|via) (the )?web/i.test(raw)) {
    return 'Provider requires a web-browser login first to approve this device. Log in once at the provider web UI, then retry.';
  }
  if (err?.authenticationFailed || code === 'AUTHENTICATIONFAILED' || /auth(entication)? failed|invalid credentials|invalid login|login failed|application-specific password required/i.test(raw)) {
    return 'Authentication failed — password rejected by the server. For Gmail/Yahoo use an App Password (not the normal password). For Comcast enable "Third Party Access Security" on xfinity.com. For Outlook make sure IMAP/basic-auth is enabled on the tenant.';
  }
  if (code === 'ETIMEDOUT' || code === 'ETIMEOUT' || /timeout/i.test(raw)) {
    return `Connection timed out while talking to the IMAP server. Check that your network allows outbound port 993 and that the server address is correct (${raw}).`;
  }
  if (code === 'ENOTFOUND' || /enotfound|getaddrinfo/i.test(raw)) {
    return `DNS lookup failed for the IMAP host. Check the hostname (${raw}).`;
  }
  if (code === 'ECONNREFUSED' || /refused/i.test(low)) {
    return 'Connection refused by the server. Wrong port or IMAP disabled on this account.';
  }
  if (code === 'ECONNRESET' || /reset/i.test(low)) {
    return 'Connection was reset by the server. Often a TLS/port mismatch — try port 993 with TLS on, or 143 with STARTTLS.';
  }
  if (/certificate|self signed|tls|ssl/i.test(low)) {
    return `TLS/certificate error: ${raw}`;
  }
  if (/no such mailbox|mailbox .* does not exist|unknown mailbox/i.test(low)) {
    return `Mailbox not found on server: ${raw}`;
  }
  return raw || 'Unknown IMAP error';
}

export async function extractContacts(config, onEvent) {
  const {
    host, port, secure, user, pass,
    scan = 'both',
    inboxMailbox = 'INBOX',
    sentMailbox = 'Sent',
    since = null,
    before = null,
    maxPerFolder = 2000,
    filters = {},
    incremental = null
  } = config;

  const auth = config.accessToken
    ? { user, accessToken: config.accessToken }
    : { user, pass, loginMethod: 'LOGIN' };

  const client = new ImapFlow({
    host, port, secure,
    auth,
    logger: {
      debug() {}, info() {}, warn() {},
      error(obj) {
        const detail = obj?.err?.responseText || obj?.err?.response || obj?.msg;
        if (detail) onEvent?.({ type: 'status', message: `IMAP server says: ${detail}` });
      }
    },
    socketTimeout: 180_000,
    greetingTimeout: 30_000,
    connectionTimeout: 30_000,
    tls: { rejectUnauthorized: false },
    disableAutoIdle: true
  });

  client.on('error', err => {
    onEvent?.({ type: 'status', message: `IMAP transport error: ${err?.message || err}` });
  });

  const ownerEmail = normalizeEmail(user);
  const contacts = new Map();
  let connected = false;
  let authenticated = false;

  try {
    onEvent?.({ type: 'status', message: `Connecting to ${host}:${port} (${secure ? 'TLS' : 'plain/STARTTLS'})…` });
    await client.connect();
    connected = true;
    authenticated = client.authenticated;
    onEvent?.({ type: 'status', message: `Connected. Server: ${client.serverInfo?.name || 'unknown'} ${client.serverInfo?.version || ''}`.trim() });

    onEvent?.({ type: 'status', message: 'Listing mailboxes…' });
    const mailboxes = await listMailboxes(client);
    if (mailboxes.length) {
      const preview = mailboxes.slice(0, 15).map(m => m.path).join(', ');
      onEvent?.({ type: 'status', message: `Found ${mailboxes.length} folders: ${preview}${mailboxes.length > 15 ? '…' : ''}` });
    } else {
      onEvent?.({ type: 'status', message: 'LIST returned no folders (will try defaults).' });
    }

    const plan = [];
    if (Array.isArray(config.folders) && config.folders.length) {
      for (const f of config.folders) {
        if (f?.path) plan.push({ direction: f.direction === 'sent' ? 'sent' : 'inbox', path: f.path });
      }
      onEvent?.({ type: 'status', message: `Scanning ${plan.length} selected folder(s).` });
    } else {
      if (scan === 'inbox' || scan === 'both') {
        const p = resolveFolder(mailboxes, 'inbox', inboxMailbox);
        if (p) plan.push({ direction: 'inbox', path: p });
        else onEvent?.({ type: 'status', message: 'Could not locate Inbox folder; skipping.' });
      }
      if (scan === 'sent' || scan === 'both') {
        const p = resolveFolder(mailboxes, 'sent', sentMailbox);
        if (p) plan.push({ direction: 'sent', path: p });
        else onEvent?.({ type: 'status', message: 'No Sent folder detected on this server; skipping.' });
      }
    }

    if (!plan.length) {
      throw new Error('No scannable folders found. Adjust the Inbox/Sent folder names in the form.');
    }

    for (const folder of plan) {
      onEvent?.({ type: 'status', message: `Opening "${folder.path}" (${folder.direction})…` });
      let lock;
      try {
        lock = await client.getMailboxLock(folder.path);
      } catch (err) {
        onEvent?.({ type: 'status', message: `Skipping "${folder.path}": ${classifyError(err)}` });
        continue;
      }

      try {
        const mailbox = client.mailbox;
        const uidValidity = Number(mailbox?.uidValidity || 0);
        let sinceUid = 0;
        let incValidityOk = true;

        if (incremental) {
          const prev = incremental.getFolderState(folder.path);
          if (prev && Number(prev.uid_validity) === uidValidity && prev.last_uid > 0) {
            sinceUid = prev.last_uid;
          } else if (prev && Number(prev.uid_validity) !== uidValidity) {
            onEvent?.({ type: 'status', message: `UIDVALIDITY changed for "${folder.path}" — doing a full re-scan.` });
            incValidityOk = false;
          }
        }

        const search = {};
        if (since) search.since = new Date(since);
        if (before) search.before = new Date(before);
        const hasCriteria = Object.keys(search).length > 0;

        let uids = [];
        try {
          if (sinceUid > 0 && incValidityOk) {
            uids = await client.search({ uid: `${sinceUid + 1}:*` }, { uid: true }) || [];
            onEvent?.({ type: 'status', message: `Incremental: ${uids.length} new message(s) since UID ${sinceUid}.` });
          } else {
            uids = await client.search(hasCriteria ? search : { all: true }, { uid: true }) || [];
          }
        } catch (err) {
          onEvent?.({ type: 'status', message: `Search failed in "${folder.path}": ${classifyError(err)}` });
          continue;
        }

        if (!uids.length) {
          onEvent?.({ type: 'status', message: `"${folder.path}" is empty (or no messages match filters).` });
          continue;
        }

        const slice = uids.slice(-maxPerFolder);
        const total = slice.length;
        const maxUid = slice.length ? Math.max(...slice.map(Number)) : sinceUid;
        onEvent?.({ type: 'folder', folder: folder.path, direction: folder.direction, total });

        let i = 0;
        const deep = !!config.deepScan;
        const fetchOpts = deep
          ? { envelope: true, uid: true, source: true, bodyParts: ['text'] }
          : { envelope: true, uid: true };
        try {
          for await (const msg of client.fetch(slice, fetchOpts, { uid: true })) {
            i++;
            const env = msg.envelope || {};
            const toLite = list => (list ? [{ value: list.map(a => ({ address: a.address, name: a.name })) }] : null);
            const lite = {
              from: toLite(env.from),
              to: toLite(env.to),
              cc: toLite(env.cc),
              bcc: toLite(env.bcc),
              replyTo: toLite(env.replyTo),
              sender: toLite(env.sender)
            };

            const addrs = addressesFromMessage(lite, folder.direction);
            const date = env.date ? new Date(env.date) : null;
            const subject = env.subject || '';
            for (const a of addrs) {
              if (passesFilters(a, filters, ownerEmail)) mergeContact(contacts, a, date, subject, 'headers');
            }

            if (deep && msg.source) {
              try {
                const parsed = await simpleParser(msg.source);
                const body = [parsed.text || '', parsed.html || ''].join('\n');
                for (const found of extractFromBody(body)) {
                  if (passesFilters(found, filters, ownerEmail)) mergeContact(contacts, found, date, subject, 'body');
                }
              } catch { /* ignore parse errors */ }
            }

            if (i % 25 === 0 || i === total) {
              onEvent?.({ type: 'progress', folder: folder.path, processed: i, total, contacts: contacts.size });
            }
          }
        } catch (err) {
          onEvent?.({ type: 'status', message: `Fetch interrupted in "${folder.path}" after ${i} messages: ${classifyError(err)}` });
        }
        if (incremental && maxUid > 0 && uidValidity > 0) {
          try { incremental.setFolderState(folder.path, uidValidity, maxUid); } catch { /* noop */ }
        }
        onEvent?.({ type: 'folder-done', folder: folder.path, processed: i });
      } finally {
        try { lock.release(); } catch { /* noop */ }
      }
    }
  } catch (err) {
    const friendly = classifyError(err);
    const e = new Error(friendly);
    e.cause = err;
    throw e;
  } finally {
    if (connected) {
      try {
        if (authenticated || client.authenticated) await client.logout();
        else client.close();
      } catch { /* noop */ }
    }
  }

  // Merge externally-supplied contacts (from provider address books etc.)
  if (Array.isArray(config.externalContacts)) {
    for (const ec of config.externalContacts) {
      if (!ec?.email) continue;
      const email = ec.email.toLowerCase();
      if (email === ownerEmail) continue;
      if (!EMAIL_RE.test(email)) continue;
      if (filters.excludeDomains?.length) {
        const domain = email.split('@')[1];
        if (filters.excludeDomains.some(d => domain === d || domain.endsWith('.' + d))) continue;
      }
      const existing = contacts.get(email);
      if (existing) {
        if (ec.name && !existing.names.includes(ec.name)) existing.names.push(ec.name);
        existing.sources.add(ec.source || 'address-book');
        if (ec.organization) existing.organization = ec.organization;
      } else {
        contacts.set(email, {
          email,
          names: ec.name ? [ec.name] : [],
          count: 0,
          sentCount: 0, receivedCount: 0, mentionedCount: 0,
          firstSeen: null, lastSeen: null, lastSubject: '',
          organization: ec.organization || '',
          sources: new Set([ec.source || 'address-book'])
        });
      }
    }
  }

  const result = Array.from(contacts.values()).map(c => ({
    email: c.email,
    name: bestName(c.names),
    aliases: c.names,
    count: c.count,
    sent: c.sentCount,
    received: c.receivedCount,
    mentioned: c.mentionedCount || 0,
    firstSeen: c.firstSeen ? c.firstSeen.toISOString() : null,
    lastSeen: c.lastSeen ? c.lastSeen.toISOString() : null,
    lastSubject: c.lastSubject,
    domain: c.email.split('@')[1] || '',
    organization: c.organization || '',
    sources: Array.from(c.sources || [])
  })).sort((a, b) => (b.count + b.mentioned) - (a.count + a.mentioned));

  onEvent?.({ type: 'done', total: result.length });
  return result;
}

const SKIP_BY_DEFAULT = ['\\trash', '\\junk', '\\drafts', '\\archive', '\\flagged', '\\important'];
const SKIP_NAME = /trash|spam|junk|draft|bulk|deleted/i;
const SENT_NAME = /sent|outbox|outgoing/i;

export function classifyFolders(mailboxes) {
  return mailboxes.map(m => {
    const su = (m.specialUse || '').toLowerCase();
    const path = m.path || '';
    let direction = 'inbox';
    if (su === '\\sent' || SENT_NAME.test(path)) direction = 'sent';
    const skipBySpecial = SKIP_BY_DEFAULT.includes(su);
    const skipByName = !su && SKIP_NAME.test(path);
    const selected = !(skipBySpecial || skipByName);
    return {
      path,
      specialUse: m.specialUse || null,
      direction,
      selected,
      flags: [...(m.flags || [])]
    };
  }).sort((a, b) => {
    if (a.specialUse === '\\Inbox') return -1;
    if (b.specialUse === '\\Inbox') return 1;
    if (a.specialUse === '\\Sent') return -1;
    if (b.specialUse === '\\Sent') return 1;
    return a.path.localeCompare(b.path);
  });
}

export async function testConnection(config) {
  const auth = config.accessToken
    ? { user: config.user, accessToken: config.accessToken }
    : { user: config.user, pass: config.pass };
  const client = new ImapFlow({
    host: config.host, port: config.port, secure: config.secure,
    auth,
    logger: false,
    socketTimeout: 30_000,
    greetingTimeout: 15_000,
    connectionTimeout: 15_000,
    tls: { rejectUnauthorized: false }
  });
  client.on('error', () => {});
  try {
    await client.connect();
    const mailboxes = await listMailboxes(client);
    return {
      ok: true,
      server: `${client.serverInfo?.name || ''} ${client.serverInfo?.version || ''}`.trim(),
      authenticated: !!client.authenticated,
      mailboxes: mailboxes.map(m => ({ path: m.path, specialUse: m.specialUse || null, flags: [...(m.flags || [])] })),
      folders: classifyFolders(mailboxes)
    };
  } catch (err) {
    return { ok: false, error: classifyError(err), raw: err?.message || String(err), code: err?.code || null };
  } finally {
    try { await client.logout(); } catch { try { client.close(); } catch { /* noop */ } }
  }
}

export function toCSV(contacts) {
  const headers = ['email', 'name', 'count', 'sent', 'received', 'firstSeen', 'lastSeen', 'domain', 'lastSubject'];
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const c of contacts) lines.push(headers.map(h => esc(c[h])).join(','));
  return lines.join('\r\n');
}

export function toVCF(contacts) {
  const out = [];
  for (const c of contacts) {
    out.push('BEGIN:VCARD');
    out.push('VERSION:3.0');
    out.push(`FN:${c.name || c.email}`);
    if (c.name) {
      const parts = c.name.split(/\s+/);
      const last = parts.length > 1 ? parts.pop() : '';
      out.push(`N:${last};${parts.join(' ')};;;`);
    }
    out.push(`EMAIL;TYPE=INTERNET:${c.email}`);
    if (c.lastSeen) out.push(`REV:${c.lastSeen}`);
    out.push('END:VCARD');
  }
  return out.join('\r\n');
}
