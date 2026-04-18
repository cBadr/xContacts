// Pure-JS JSON file store — no native deps. Works on any OS / Node version.
// API is intentionally identical to the previous SQLite-backed module, so
// server/src/index.js needs no changes.

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const DATA_DIR = process.env.XC_DATA_DIR || path.join(process.cwd(), 'data');
try { mkdirSync(DATA_DIR, { recursive: true }); }
catch (e) { console.warn(`[db] cannot create data dir ${DATA_DIR}:`, e.message); }

const FILE = path.join(DATA_DIR, 'xcontacts.json');
const BAK = FILE + '.bak';

const DEFAULT_STATE = {
  version: 1,
  nextId: { accounts: 1, contacts: 1, scans: 1 },
  accounts: [],
  contacts: [],
  folder_state: [],
  scans: []
};

function loadState() {
  for (const candidate of [FILE, BAK]) {
    if (!existsSync(candidate)) continue;
    try {
      const raw = readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { ...DEFAULT_STATE, ...parsed };
    } catch (e) {
      console.warn(`[db] could not load ${candidate}: ${e.message}`);
    }
  }
  return structuredClone(DEFAULT_STATE);
}

let state = loadState();
console.log(`[db] JSON store ready at ${FILE} — ${state.accounts.length} account(s), ${state.contacts.length} contact(s)`);

let saveTimer = null;
let saving = false;
let pending = false;

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 200);
}

function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (saving) { pending = true; return; }
  saving = true;
  try {
    const json = JSON.stringify(state);
    const tmp = path.join(DATA_DIR, `.xcontacts.${process.pid}.tmp`);
    writeFileSync(tmp, json, 'utf8');
    if (existsSync(FILE)) {
      try { copyFileSync(FILE, BAK); } catch { /* noop */ }
    }
    renameSync(tmp, FILE);
  } catch (e) {
    console.error('[db] save failed:', e.message);
  } finally {
    saving = false;
    if (pending) { pending = false; scheduleSave(); }
  }
}

function flushSync() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    const json = JSON.stringify(state);
    writeFileSync(FILE, json, 'utf8');
  } catch (e) { console.error('[db] final save failed:', e.message); }
}

process.on('beforeExit', flushSync);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  try { process.on(sig, () => { flushSync(); process.exit(0); }); } catch { /* win */ }
}

// ========== accounts ==========
export function listAccounts() {
  return state.accounts
    .map(a => ({ ...a, contact_count: state.contacts.filter(c => c.account_id === a.id).length }))
    .sort((a, b) => (b.last_scan_at || b.created_at) - (a.last_scan_at || a.created_at));
}

export const getAccount = id => state.accounts.find(a => a.id === Number(id)) || null;
export const getAccountByEmail = email =>
  state.accounts.find(a => a.email?.toLowerCase() === String(email || '').toLowerCase()) || null;

export function upsertAccount(data) {
  let a = getAccountByEmail(data.email);
  if (a) {
    a.auth_method = data.auth_method;
    a.oauth_provider = data.oauth_provider || null;
    a.host = data.host;
    a.port = data.port;
    a.secure = data.secure ? 1 : 0;
    a.inbox_mailbox = data.inbox_mailbox;
    a.sent_mailbox = data.sent_mailbox;
  } else {
    a = {
      id: state.nextId.accounts++,
      email: data.email,
      display_name: data.display_name || null,
      auth_method: data.auth_method,
      oauth_provider: data.oauth_provider || null,
      host: data.host,
      port: data.port,
      secure: data.secure ? 1 : 0,
      inbox_mailbox: data.inbox_mailbox,
      sent_mailbox: data.sent_mailbox,
      created_at: Date.now(),
      last_scan_at: null
    };
    state.accounts.push(a);
  }
  scheduleSave();
  return a.id;
}

export function deleteAccount(id) {
  id = Number(id);
  state.accounts = state.accounts.filter(a => a.id !== id);
  state.contacts = state.contacts.filter(c => c.account_id !== id);
  state.folder_state = state.folder_state.filter(f => f.account_id !== id);
  state.scans = state.scans.filter(s => s.account_id !== id);
  scheduleSave();
}

export function touchAccountScan(id) {
  const a = getAccount(id);
  if (a) { a.last_scan_at = Date.now(); scheduleSave(); }
}

// ========== folder_state ==========
export const getFolderState = (accountId, folder) =>
  state.folder_state.find(f => f.account_id === Number(accountId) && f.folder === folder) || null;

export function setFolderState(accountId, folder, uidValidity, lastUid) {
  accountId = Number(accountId);
  let f = getFolderState(accountId, folder);
  if (f) {
    f.uid_validity = uidValidity;
    f.last_uid = lastUid;
    f.updated_at = Date.now();
  } else {
    state.folder_state.push({
      account_id: accountId, folder,
      uid_validity: uidValidity, last_uid: lastUid,
      updated_at: Date.now()
    });
  }
  scheduleSave();
}

export function resetFolderState(accountId) {
  accountId = Number(accountId);
  state.folder_state = state.folder_state.filter(f => f.account_id !== accountId);
  scheduleSave();
}

// ========== contacts ==========
export function listContacts(accountId) {
  accountId = Number(accountId);
  return state.contacts
    .filter(c => c.account_id === accountId)
    .sort((a, b) => b.count - a.count)
    .map(c => ({
      email: c.email,
      name: c.name || '',
      aliases: c.aliases || [],
      count: c.count,
      sent: c.sent,
      received: c.received,
      mentioned: c.mentioned || 0,
      firstSeen: c.first_seen,
      lastSeen: c.last_seen,
      lastSubject: c.last_subject || '',
      domain: c.domain || '',
      organization: c.organization || '',
      sources: c.sources || [],
      tags: c.tags || []
    }));
}

export function upsertContacts(accountId, contacts) {
  accountId = Number(accountId);
  const index = new Map();
  for (const c of state.contacts) if (c.account_id === accountId) index.set(c.email, c);

  for (const nc of contacts) {
    const existing = index.get(nc.email);
    if (existing) {
      if (nc.name && !existing.name) existing.name = nc.name;
      if (Array.isArray(nc.aliases) && nc.aliases.length) existing.aliases = nc.aliases;
      existing.count += nc.count;
      existing.sent += nc.sent;
      existing.received += nc.received;
      existing.mentioned = (existing.mentioned || 0) + (nc.mentioned || 0);
      if (nc.firstSeen && (!existing.first_seen || nc.firstSeen < existing.first_seen)) existing.first_seen = nc.firstSeen;
      if (nc.lastSeen && (!existing.last_seen || nc.lastSeen > existing.last_seen)) {
        existing.last_seen = nc.lastSeen;
        existing.last_subject = nc.lastSubject || existing.last_subject;
      }
      if (nc.domain) existing.domain = nc.domain;
      if (nc.organization) existing.organization = nc.organization;
      const merged = new Set([...(existing.sources || []), ...(nc.sources || [])]);
      existing.sources = Array.from(merged);
    } else {
      const row = {
        id: state.nextId.contacts++,
        account_id: accountId,
        email: nc.email,
        name: nc.name || '',
        aliases: nc.aliases || [],
        count: nc.count,
        sent: nc.sent,
        received: nc.received,
        mentioned: nc.mentioned || 0,
        first_seen: nc.firstSeen || null,
        last_seen: nc.lastSeen || null,
        last_subject: nc.lastSubject || '',
        domain: nc.domain || '',
        organization: nc.organization || '',
        sources: nc.sources || [],
        tags: []
      };
      state.contacts.push(row);
      index.set(nc.email, row);
    }
  }
  scheduleSave();
}

export const countContacts = accountId =>
  state.contacts.filter(c => c.account_id === Number(accountId)).length;

export function clearContacts(accountId) {
  accountId = Number(accountId);
  state.contacts = state.contacts.filter(c => c.account_id !== accountId);
  scheduleSave();
}

// ========== scans ==========
export function createScan(accountId, mode) {
  const id = state.nextId.scans++;
  state.scans.push({
    id, account_id: Number(accountId),
    started_at: Date.now(), mode, status: 'running',
    finished_at: null, folders_scanned: null,
    messages_processed: 0, new_contacts: 0, total_contacts: 0, error: null
  });
  scheduleSave();
  return id;
}

export function finishScan(scanId, patch) {
  const s = state.scans.find(x => x.id === Number(scanId));
  if (!s) return;
  const allowed = ['finished_at', 'folders_scanned', 'messages_processed', 'new_contacts', 'total_contacts', 'status', 'error'];
  for (const k of allowed) if (patch[k] !== undefined) s[k] = patch[k];
  scheduleSave();
}

export const listScans = (accountId, limit = 20) =>
  state.scans
    .filter(s => s.account_id === Number(accountId))
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, Math.max(1, limit));

export default { flush: flushSync };
