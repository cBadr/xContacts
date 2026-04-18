import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { IMAP_PRESETS, detectPreset } from './presets.js';
import { extractContacts, testConnection, toCSV, toVCF, toEmailList } from './extractor.js';
import { listConfiguredProviders, buildAuthUrl, exchangeCode, refreshAccessToken, getProvider } from './oauth.js';
import { fetchAddressBook } from './addressbook.js';
import {
  listAccounts, getAccount, upsertAccount, deleteAccount, touchAccountScan,
  getFolderState, setFolderState, resetFolderState,
  listContacts, listAllContactsMerged, upsertContacts, countContacts, clearContacts,
  createScan, finishScan, listScans
} from './db.js';

const app = express();
const PORT = Number(process.env.PORT) || 5174;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const MAX_FETCH = Number(process.env.MAX_FETCH_PER_FOLDER) || 5000;

app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 30 }));

const sessions = new Map(); // token -> { contacts, createdAt }
const SESSION_TTL = 30 * 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (now - v.createdAt > SESSION_TTL) sessions.delete(k);
}, 60_000).unref();

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '1.0.0' }));

app.get('/api/presets', (_req, res) => {
  res.json(Object.entries(IMAP_PRESETS).map(([k, v]) => ({ key: k, ...v })));
});

app.post('/api/detect', (req, res) => {
  const email = String(req.body?.email || '');
  const key = detectPreset(email);
  res.json({ preset: key, config: key ? IMAP_PRESETS[key] : null });
});

const scanSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(true),
  user: z.string().email(),
  pass: z.string().optional(),
  accessToken: z.string().optional(),
  scan: z.enum(['inbox', 'sent', 'both']).default('both'),
  folders: z.array(z.object({
    path: z.string().min(1),
    direction: z.enum(['inbox', 'sent']).default('inbox')
  })).optional(),
  inboxMailbox: z.string().default('INBOX'),
  sentMailbox: z.string().default('Sent'),
  since: z.string().nullable().optional(),
  before: z.string().nullable().optional(),
  maxPerFolder: z.number().int().min(10).max(MAX_FETCH).default(1000),
  filters: z.object({
    excludeDomains: z.array(z.string()).default([]),
    excludeNoReply: z.boolean().default(true),
    requireName: z.boolean().default(false)
  }).default({}),
  saveAccount: z.boolean().default(true),
  incremental: z.boolean().default(false),
  accountId: z.number().int().optional(),
  includeAddressBook: z.boolean().default(true),
  deepScan: z.boolean().default(false),
  oauthProvider: z.enum(['google', 'microsoft']).optional()
}).refine(d => d.pass || d.accessToken, { message: 'Either pass or accessToken is required' });

const testSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(true),
  user: z.string().email(),
  pass: z.string().optional(),
  accessToken: z.string().optional()
}).refine(d => d.pass || d.accessToken, { message: 'Either pass or accessToken is required' });

app.post('/api/test', async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'Invalid input' });
  const result = await testConnection(parsed.data);
  res.json(result);
});

const oauthSessions = new Map();
const OAUTH_TTL = 45 * 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of oauthSessions) if (now - v.createdAt > OAUTH_TTL) oauthSessions.delete(k);
}, 60_000).unref();

function oauthRedirectUri(req) {
  const base = process.env.OAUTH_REDIRECT_BASE || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/oauth/callback`;
}

app.get('/api/oauth/providers', (_req, res) => {
  res.json(listConfiguredProviders());
});

app.get('/api/oauth/:provider/start', (req, res) => {
  try {
    const { provider } = req.params;
    if (!getProvider(provider)) return res.status(400).json({ error: 'Unknown provider' });
    const redirectUri = oauthRedirectUri(req);
    const { url, state } = buildAuthUrl(provider, redirectUri);
    oauthSessions.set(state, { provider, createdAt: Date.now() });
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/oauth/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const send = (type, data = {}) => {
    const payload = JSON.stringify({ type: `xcontacts-oauth:${type}`, ...data });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>xContacts</title>
<style>body{font-family:system-ui;background:#0b1020;color:#e8ecf8;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:24px}
.card{background:#141a2e;border:1px solid #273055;border-radius:12px;padding:28px;max-width:420px}
.ok{color:#4ade80}.err{color:#f87171}</style></head>
<body><div class="card">
<h2 class="${type === 'success' ? 'ok' : 'err'}">${type === 'success' ? '✓ Signed in' : '✗ Sign-in failed'}</h2>
<p>${type === 'success' ? 'You can close this window.' : (data.error || 'Unknown error')}</p>
</div>
<script>try{window.opener&&window.opener.postMessage(${payload},'*')}catch(e){}setTimeout(()=>window.close(),1500);</script>
</body></html>`);
  };

  if (error) return send('error', { error: error_description || error });
  if (!code || !state) return send('error', { error: 'Missing code or state' });

  try {
    const result = await exchangeCode({ code, state, redirectUri: oauthRedirectUri(req) });
    oauthSessions.set(state, { ...result, createdAt: Date.now() });
    send('success', {
      session: state,
      email: result.email,
      provider: result.provider,
      imap: result.imap,
      expiresAt: result.expiresAt
    });
  } catch (err) {
    send('error', { error: err.message });
  }
});

app.post('/api/oauth/token/:session', async (req, res) => {
  const s = oauthSessions.get(req.params.session);
  if (!s) return res.status(404).json({ error: 'Session expired, please sign in again' });
  if (Date.now() < s.expiresAt - 30_000) {
    return res.json({ accessToken: s.accessToken, email: s.email, imap: s.imap, expiresAt: s.expiresAt });
  }
  if (!s.refreshToken) return res.status(401).json({ error: 'Token expired and no refresh token available' });
  try {
    const r = await refreshAccessToken({ provider: s.provider, refreshToken: s.refreshToken });
    s.accessToken = r.accessToken;
    s.expiresAt = r.expiresAt;
    res.json({ accessToken: r.accessToken, email: s.email, imap: s.imap, expiresAt: r.expiresAt });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/oauth/revoke/:session', (req, res) => {
  oauthSessions.delete(req.params.session);
  res.json({ ok: true });
});

app.get('/api/accounts', (_req, res) => res.json(listAccounts()));

app.get('/api/accounts/:id', (req, res) => {
  const id = Number(req.params.id);
  const account = getAccount(id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const contacts = listContacts(id);
  const scans = listScans(id, 20);
  res.json({ account, contacts, scans });
});

app.delete('/api/accounts/:id', (req, res) => {
  deleteAccount(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/accounts/:id/reset', (req, res) => {
  const id = Number(req.params.id);
  clearContacts(id);
  resetFolderState(id);
  res.json({ ok: true });
});

app.post('/api/scan', async (req, res) => {
  const parsed = scanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  const cfg = parsed.data;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);

  let accountId = null;
  let scanId = null;

  try {
    if (cfg.saveAccount) {
      accountId = upsertAccount({
        email: cfg.user,
        auth_method: cfg.accessToken ? 'oauth' : 'password',
        oauth_provider: cfg.accessToken ? (cfg.oauthProvider || null) : null,
        host: cfg.host, port: cfg.port, secure: cfg.secure,
        inbox_mailbox: cfg.inboxMailbox, sent_mailbox: cfg.sentMailbox
      });
      scanId = createScan(accountId, cfg.incremental ? 'incremental' : 'full');
      send({ type: 'account', accountId, scanId });
    }

    const before = accountId ? countContacts(accountId) : 0;

    const incremental = (cfg.incremental && accountId) ? {
      getFolderState: folder => getFolderState(accountId, folder),
      setFolderState: (folder, uv, lu) => setFolderState(accountId, folder, uv, lu)
    } : null;

    let externalContacts = [];
    if (cfg.includeAddressBook && cfg.accessToken && cfg.oauthProvider) {
      send({ type: 'status', message: `Fetching address book from ${cfg.oauthProvider}…` });
      try {
        externalContacts = await fetchAddressBook(cfg.oauthProvider, cfg.accessToken, ev => {
          if (ev.error) send({ type: 'status', message: `Address book (${ev.source}): ${ev.error}` });
          else send({ type: 'status', message: `Address book (${ev.source}): ${ev.fetched} entries` });
        });
        send({ type: 'status', message: `Address book: ${externalContacts.length} entries fetched.` });
      } catch (e) {
        send({ type: 'status', message: `Address book fetch failed: ${e.message}` });
      }
    }

    const contacts = await extractContacts({ ...cfg, incremental, externalContacts }, send);

    if (accountId) {
      upsertContacts(accountId, contacts);
      touchAccountScan(accountId);
      const total = countContacts(accountId);
      const fresh = listContacts(accountId);
      finishScan(scanId, {
        finished_at: Date.now(),
        status: 'ok',
        total_contacts: total,
        new_contacts: Math.max(0, total - before)
      });
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessions.set(token, { contacts: fresh, createdAt: Date.now() });
      send({ type: 'result', token, contacts: fresh, accountId, totalContacts: total, newContacts: Math.max(0, total - before) });
    } else {
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessions.set(token, { contacts, createdAt: Date.now() });
      send({ type: 'result', token, contacts });
    }
  } catch (err) {
    if (scanId) finishScan(scanId, { finished_at: Date.now(), status: 'error', error: err?.message || 'Scan failed' });
    send({ type: 'error', message: err?.message || 'Scan failed' });
  } finally {
    clearInterval(ping);
    res.end();
  }
});

app.get('/api/accounts/:id/export/:format', (req, res) => {
  const id = Number(req.params.id);
  const account = getAccount(id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  return sendExport(res, listContacts(id), req.params.format, account.email);
});

app.get('/api/export-all/:format', (req, res) => {
  const merged = listAllContactsMerged();
  return sendExport(res, merged, req.params.format, 'all-accounts');
});

app.get('/api/export/:token/:format', (req, res) => {
  const { token, format } = req.params;
  const sess = sessions.get(token);
  if (!sess) return res.status(404).json({ error: 'Session expired' });
  return sendExport(res, sess.contacts, format);
});

function sendExport(res, contacts, format, label) {
  const stamp = new Date().toISOString().slice(0, 10);
  const prefix = label ? `xcontacts-${label.replace(/[^a-z0-9]+/gi, '_')}-${stamp}` : `xcontacts-${stamp}`;
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${prefix}.csv"`);
    return res.send('\uFEFF' + toCSV(contacts));
  }
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${prefix}.json"`);
    return res.send(JSON.stringify(contacts, null, 2));
  }
  if (format === 'vcf') {
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${prefix}.vcf"`);
    return res.send(toVCF(contacts));
  }
  if (format === 'txt' || format === 'emails') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${prefix}-emails.txt"`);
    return res.send(toEmailList(contacts));
  }
  res.status(400).json({ error: 'Unknown format' });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || 'Internal error' });
});

process.on('uncaughtException', err => {
  console.error('[uncaughtException]', err?.message || err);
});
process.on('unhandledRejection', err => {
  console.error('[unhandledRejection]', err?.message || err);
});

app.listen(PORT, () => {
  console.log(`xContacts server listening on http://localhost:${PORT}`);
});
