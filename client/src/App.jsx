import React, { useEffect, useRef, useState } from 'react';
import ConnectPanel from './components/ConnectPanel.jsx';
import ContactsTable from './components/ContactsTable.jsx';
import TopBar from './components/TopBar.jsx';
import AccountsBar from './components/AccountsBar.jsx';
import BackendStatus from './components/BackendStatus.jsx';
import {
  scanStream, exportUrl, accountExportUrl,
  listAccounts, getAccount, deleteAccount
} from './api.js';
import { useI18n } from './i18n.jsx';

export default function App() {
  const { t } = useI18n();
  const [scanning, setScanning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ processed: 0, total: 0, folder: '' });
  const [contacts, setContacts] = useState([]);
  const [token, setToken] = useState(null);
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  const [prefill, setPrefill] = useState(null);
  const cancelRef = useRef(null);

  const log = (msg, kind = '') => setLogs(l => [...l.slice(-200), { msg, kind, t: Date.now() }]);

  const refreshAccounts = async () => {
    try { setAccounts(await listAccounts()); } catch {}
  };

  useEffect(() => { refreshAccounts(); }, []);

  const selectAccount = async id => {
    try {
      const data = await getAccount(id);
      setActiveAccountId(id);
      setContacts(data.contacts);
      setToken(null);
      setError('');
      setLogs([]);
      setPrefill({
        email: data.account.email,
        host: data.account.host,
        port: data.account.port,
        secure: !!data.account.secure,
        inboxMailbox: data.account.inbox_mailbox,
        sentMailbox: data.account.sent_mailbox,
        authMethod: data.account.auth_method,
        lastScanAt: data.account.last_scan_at
      });
    } catch (e) {
      setError(e.message);
    }
  };

  const onDeleteAccount = async id => {
    if (!window.confirm(t('confirmDelete'))) return;
    await deleteAccount(id);
    if (activeAccountId === id) {
      setActiveAccountId(null);
      setContacts([]);
      setPrefill(null);
    }
    await refreshAccounts();
  };

  const handleScan = cfg => {
    setScanning(true);
    setLogs([]);
    if (!cfg.incremental) setContacts([]);
    setToken(null);
    setError('');
    setProgress({ processed: 0, total: 0, folder: '' });
    log(t('startingScan', { email: cfg.user, mode: cfg.scan }));
    if (cfg.incremental) log(`Mode: incremental — only new messages since last scan.`);

    cancelRef.current = scanStream(cfg, {
      onEvent: ev => {
        if (ev.type === 'status') log(ev.message);
        else if (ev.type === 'account') setActiveAccountId(ev.accountId);
        else if (ev.type === 'folder') {
          log(`Fetching ${ev.total} message(s) from "${ev.folder}" (${ev.direction})`);
          setProgress({ processed: 0, total: ev.total, folder: ev.folder });
        } else if (ev.type === 'progress') {
          setProgress({ processed: ev.processed, total: ev.total, folder: ev.folder });
        } else if (ev.type === 'folder-done') {
          log(`Finished "${ev.folder}" — ${ev.processed} messages`, 'ok');
        } else if (ev.type === 'result') {
          setContacts(ev.contacts);
          setToken(ev.token);
          if (ev.accountId) setActiveAccountId(ev.accountId);
          const extra = ev.newContacts !== undefined ? ` (${t('newContacts', { n: ev.newContacts })})` : '';
          log(t('extracted', { n: ev.contacts.length }) + extra, 'ok');
        } else if (ev.type === 'done') {
          log(t('scanComplete'), 'ok');
        } else if (ev.type === 'error') {
          setError(ev.message);
          log(`Error: ${ev.message}`, 'err');
        }
      },
      onDone: () => { setScanning(false); refreshAccounts(); }
    });
  };

  const cancel = () => {
    cancelRef.current?.();
    setScanning(false);
    log(t('scanCancelled'), 'err');
  };

  const totalSent = contacts.reduce((s, c) => s + c.sent, 0);
  const totalReceived = contacts.reduce((s, c) => s + c.received, 0);
  const domains = new Set(contacts.map(c => c.domain)).size;
  const pct = progress.total ? Math.min(100, Math.round(progress.processed / progress.total * 100)) : 0;

  return (
    <div className="app">
      <TopBar />
      <BackendStatus />

      <AccountsBar
        accounts={accounts}
        activeId={activeAccountId}
        onSelect={selectAccount}
        onDelete={onDeleteAccount}
      />

      <div className="grid">
        <ConnectPanel
          onScan={handleScan}
          scanning={scanning}
          onCancel={cancel}
          prefill={prefill}
          activeAccountId={activeAccountId}
        />

        <div className="card">
          <h2>{t('results')}</h2>

          {(scanning || progress.total > 0) && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                <span>{progress.folder || t('preparing')}</span>
                <span>{progress.processed} / {progress.total || '?'} · {pct}%</span>
              </div>
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
            </>
          )}

          {error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}

          <div className="log">
            {logs.length === 0 && <div style={{ color: 'var(--muted)' }}>{t('connectHint')}</div>}
            {logs.map((l, i) => (
              <div key={i} className={l.kind}>
                <span style={{ color: 'var(--muted)' }}>{new Date(l.t).toLocaleTimeString()}</span> {l.msg}
              </div>
            ))}
          </div>

          {contacts.length > 0 && (
            <>
              <div className="stats" style={{ marginTop: 16 }}>
                <div className="stat"><div className="v">{contacts.length}</div><div className="l">{t('statContacts')}</div></div>
                <div className="stat"><div className="v">{totalSent}</div><div className="l">{t('statSent')}</div></div>
                <div className="stat"><div className="v">{totalReceived}</div><div className="l">{t('statReceived')}</div></div>
                <div className="stat"><div className="v">{domains}</div><div className="l">{t('statDomains')}</div></div>
              </div>

              <div className="toolbar">
                {activeAccountId ? (
                  <>
                    <a className="btn" href={accountExportUrl(activeAccountId, 'csv')} download>{t('exportCsv')}</a>
                    <a className="btn" href={accountExportUrl(activeAccountId, 'json')} download>{t('exportJson')}</a>
                    <a className="btn" href={accountExportUrl(activeAccountId, 'vcf')} download>{t('exportVcf')}</a>
                  </>
                ) : token && (
                  <>
                    <a className="btn" href={exportUrl(token, 'csv')} download>{t('exportCsv')}</a>
                    <a className="btn" href={exportUrl(token, 'json')} download>{t('exportJson')}</a>
                    <a className="btn" href={exportUrl(token, 'vcf')} download>{t('exportVcf')}</a>
                  </>
                )}
              </div>

              <ContactsTable contacts={contacts} />
            </>
          )}
        </div>
      </div>

      <div className="footer">{t('footer')} · {t('storedLocally')}</div>
    </div>
  );
}
