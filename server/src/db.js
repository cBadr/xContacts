import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.XC_DATA_DIR || path.join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });
const dbPath = path.join(DATA_DIR, 'xcontacts.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    auth_method TEXT NOT NULL DEFAULT 'password',
    oauth_provider TEXT,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    secure INTEGER NOT NULL DEFAULT 1,
    inbox_mailbox TEXT NOT NULL DEFAULT 'INBOX',
    sent_mailbox TEXT NOT NULL DEFAULT 'Sent',
    created_at INTEGER NOT NULL,
    last_scan_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS folder_state (
    account_id INTEGER NOT NULL,
    folder TEXT NOT NULL,
    uid_validity INTEGER,
    last_uid INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER,
    PRIMARY KEY (account_id, folder),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    aliases TEXT,
    count INTEGER NOT NULL DEFAULT 0,
    sent INTEGER NOT NULL DEFAULT 0,
    received INTEGER NOT NULL DEFAULT 0,
    first_seen TEXT,
    last_seen TEXT,
    last_subject TEXT,
    domain TEXT,
    tags TEXT,
    UNIQUE (account_id, email),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_count ON contacts(account_id, count DESC);

  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    mode TEXT NOT NULL,
    folders_scanned TEXT,
    messages_processed INTEGER DEFAULT 0,
    new_contacts INTEGER DEFAULT 0,
    total_contacts INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    error TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_scans_account ON scans(account_id, started_at DESC);
`);

// ========== accounts ==========
export const listAccounts = () =>
  db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM contacts c WHERE c.account_id = a.id) AS contact_count
    FROM accounts a ORDER BY COALESCE(last_scan_at, created_at) DESC
  `).all();

export const getAccount = id => db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
export const getAccountByEmail = email => db.prepare('SELECT * FROM accounts WHERE email = ?').get(email);

export function upsertAccount(data) {
  const existing = getAccountByEmail(data.email);
  if (existing) {
    db.prepare(`UPDATE accounts SET auth_method=?, oauth_provider=?, host=?, port=?, secure=?, inbox_mailbox=?, sent_mailbox=? WHERE id=?`)
      .run(data.auth_method, data.oauth_provider || null, data.host, data.port, data.secure ? 1 : 0, data.inbox_mailbox, data.sent_mailbox, existing.id);
    return existing.id;
  }
  const r = db.prepare(`
    INSERT INTO accounts (email, display_name, auth_method, oauth_provider, host, port, secure, inbox_mailbox, sent_mailbox, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(data.email, data.display_name || null, data.auth_method, data.oauth_provider || null,
    data.host, data.port, data.secure ? 1 : 0, data.inbox_mailbox, data.sent_mailbox, Date.now());
  return Number(r.lastInsertRowid);
}

export const deleteAccount = id => db.prepare('DELETE FROM accounts WHERE id = ?').run(id);

export const touchAccountScan = id =>
  db.prepare('UPDATE accounts SET last_scan_at = ? WHERE id = ?').run(Date.now(), id);

// ========== folder_state ==========
export const getFolderState = (accountId, folder) =>
  db.prepare('SELECT * FROM folder_state WHERE account_id = ? AND folder = ?').get(accountId, folder);

export const setFolderState = (accountId, folder, uidValidity, lastUid) =>
  db.prepare(`
    INSERT INTO folder_state (account_id, folder, uid_validity, last_uid, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_id, folder) DO UPDATE SET
      uid_validity = excluded.uid_validity,
      last_uid = excluded.last_uid,
      updated_at = excluded.updated_at
  `).run(accountId, folder, uidValidity, lastUid, Date.now());

export const resetFolderState = accountId =>
  db.prepare('DELETE FROM folder_state WHERE account_id = ?').run(accountId);

// ========== contacts ==========
export function listContacts(accountId) {
  return db.prepare('SELECT * FROM contacts WHERE account_id = ? ORDER BY count DESC').all(accountId)
    .map(c => ({
      email: c.email, name: c.name || '',
      aliases: c.aliases ? JSON.parse(c.aliases) : [],
      count: c.count, sent: c.sent, received: c.received,
      firstSeen: c.first_seen, lastSeen: c.last_seen,
      lastSubject: c.last_subject || '', domain: c.domain || '',
      tags: c.tags ? JSON.parse(c.tags) : []
    }));
}

const _upsertContact = db.prepare(`
  INSERT INTO contacts (account_id, email, name, aliases, count, sent, received, first_seen, last_seen, last_subject, domain)
  VALUES (@account_id, @email, @name, @aliases, @count, @sent, @received, @first_seen, @last_seen, @last_subject, @domain)
  ON CONFLICT(account_id, email) DO UPDATE SET
    name = CASE WHEN excluded.name != '' AND (name IS NULL OR name = '') THEN excluded.name ELSE name END,
    aliases = excluded.aliases,
    count = count + excluded.count,
    sent = sent + excluded.sent,
    received = received + excluded.received,
    first_seen = CASE WHEN first_seen IS NULL OR excluded.first_seen < first_seen THEN excluded.first_seen ELSE first_seen END,
    last_seen = CASE WHEN last_seen IS NULL OR excluded.last_seen > last_seen THEN excluded.last_seen ELSE last_seen END,
    last_subject = CASE WHEN last_seen IS NULL OR excluded.last_seen > last_seen THEN excluded.last_subject ELSE last_subject END,
    domain = excluded.domain
`);

export const upsertContacts = db.transaction((accountId, contacts) => {
  for (const c of contacts) {
    _upsertContact.run({
      account_id: accountId, email: c.email, name: c.name || '',
      aliases: JSON.stringify(c.aliases || []),
      count: c.count, sent: c.sent, received: c.received,
      first_seen: c.firstSeen || null, last_seen: c.lastSeen || null,
      last_subject: c.lastSubject || '', domain: c.domain || ''
    });
  }
});

export const countContacts = accountId =>
  db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE account_id = ?').get(accountId).n;

export const clearContacts = accountId =>
  db.prepare('DELETE FROM contacts WHERE account_id = ?').run(accountId);

// ========== scans ==========
export const createScan = (accountId, mode) =>
  Number(db.prepare(`INSERT INTO scans (account_id, started_at, mode) VALUES (?, ?, ?)`)
    .run(accountId, Date.now(), mode).lastInsertRowid);

export function finishScan(scanId, patch) {
  const fields = ['finished_at', 'folders_scanned', 'messages_processed', 'new_contacts', 'total_contacts', 'status', 'error'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (patch[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(typeof patch[f] === 'object' ? JSON.stringify(patch[f]) : patch[f]);
    }
  }
  if (!updates.length) return;
  values.push(scanId);
  db.prepare(`UPDATE scans SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export const listScans = (accountId, limit = 20) =>
  db.prepare('SELECT * FROM scans WHERE account_id = ? ORDER BY started_at DESC LIMIT ?').all(accountId, limit);

export default db;
