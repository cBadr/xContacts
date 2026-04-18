import React, { useRef, useState } from 'react';
import ConnectPanel from './components/ConnectPanel.jsx';
import ContactsTable from './components/ContactsTable.jsx';
import { scanStream, exportUrl } from './api.js';

export default function App() {
  const [scanning, setScanning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ processed: 0, total: 0, folder: '' });
  const [contacts, setContacts] = useState([]);
  const [token, setToken] = useState(null);
  const [error, setError] = useState('');
  const cancelRef = useRef(null);

  const log = (msg, kind = '') => setLogs(l => [...l.slice(-200), { msg, kind, t: Date.now() }]);

  const handleScan = cfg => {
    setScanning(true);
    setLogs([]);
    setContacts([]);
    setToken(null);
    setError('');
    setProgress({ processed: 0, total: 0, folder: '' });
    log(`Starting scan for ${cfg.user} (${cfg.scan})…`);

    cancelRef.current = scanStream(cfg, {
      onEvent: ev => {
        if (ev.type === 'status') log(ev.message);
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
          log(`Extracted ${ev.contacts.length} unique contact(s).`, 'ok');
        } else if (ev.type === 'done') {
          log('Scan complete.', 'ok');
        } else if (ev.type === 'error') {
          setError(ev.message);
          log(`Error: ${ev.message}`, 'err');
        }
      },
      onDone: () => setScanning(false)
    });
  };

  const cancel = () => {
    cancelRef.current?.();
    setScanning(false);
    log('Scan cancelled.', 'err');
  };

  const totalSent = contacts.reduce((s, c) => s + c.sent, 0);
  const totalReceived = contacts.reduce((s, c) => s + c.received, 0);
  const domains = new Set(contacts.map(c => c.domain)).size;
  const pct = progress.total ? Math.min(100, Math.round(progress.processed / progress.total * 100)) : 0;

  return (
    <div className="app">
      <div className="brand">
        <div className="logo">x</div>
        <div>
          <h1>xContacts</h1>
          <div className="tag">Extract contacts from any IMAP mailbox · Inbox, Sent, or both</div>
        </div>
      </div>

      <div className="grid">
        <ConnectPanel onScan={handleScan} scanning={scanning} onCancel={cancel} />

        <div className="card">
          <h2>Results</h2>

          {(scanning || progress.total > 0) && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                <span>{progress.folder || 'Preparing…'}</span>
                <span>{progress.processed} / {progress.total || '?'} · {pct}%</span>
              </div>
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
            </>
          )}

          {error && <div className="pill danger" style={{ marginTop: 10 }}>{error}</div>}

          <div className="log">
            {logs.length === 0 && <div style={{ color: 'var(--muted)' }}>Connect an account and press "Start scan" to begin.</div>}
            {logs.map((l, i) => (
              <div key={i} className={l.kind}>
                <span style={{ color: '#5c6790' }}>{new Date(l.t).toLocaleTimeString()}</span> {l.msg}
              </div>
            ))}
          </div>

          {contacts.length > 0 && (
            <>
              <div className="stats" style={{ marginTop: 16 }}>
                <div className="stat"><div className="v">{contacts.length}</div><div className="l">Contacts</div></div>
                <div className="stat"><div className="v">{totalSent}</div><div className="l">Sent-to hits</div></div>
                <div className="stat"><div className="v">{totalReceived}</div><div className="l">Received-from hits</div></div>
                <div className="stat"><div className="v">{domains}</div><div className="l">Unique domains</div></div>
              </div>

              <div className="toolbar">
                {token && (
                  <>
                    <a className="btn" href={exportUrl(token, 'csv')} download>Export CSV</a>
                    <a className="btn" href={exportUrl(token, 'json')} download>Export JSON</a>
                    <a className="btn" href={exportUrl(token, 'vcf')} download>Export vCard</a>
                  </>
                )}
              </div>

              <ContactsTable contacts={contacts} />
            </>
          )}
        </div>
      </div>

      <div className="footer">
        xContacts v1.0 · credentials are held in memory for the scan session only, never written to disk.
      </div>
    </div>
  );
}
