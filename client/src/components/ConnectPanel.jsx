import React, { useEffect, useState } from 'react';
import { getPresets, detectPreset, testConnection } from '../api.js';

const SCAN_MODES = [
  { key: 'inbox', label: 'Inbox only' },
  { key: 'sent', label: 'Sent only' },
  { key: 'both', label: 'Both' }
];

export default function ConnectPanel({ onScan, scanning, onCancel }) {
  const [presets, setPresets] = useState([]);
  const [presetKey, setPresetKey] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(993);
  const [secure, setSecure] = useState(true);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [inboxMailbox, setInboxMailbox] = useState('INBOX');
  const [sentMailbox, setSentMailbox] = useState('Sent');
  const [scan, setScan] = useState('both');
  const [since, setSince] = useState('');
  const [before, setBefore] = useState('');
  const [maxPerFolder, setMaxPerFolder] = useState(1000);
  const [excludeDomains, setExcludeDomains] = useState('');
  const [excludeNoReply, setExcludeNoReply] = useState(true);
  const [requireName, setRequireName] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => { getPresets().then(setPresets).catch(() => {}); }, []);

  const applyPreset = key => {
    setPresetKey(key);
    const p = presets.find(x => x.key === key);
    if (p) {
      setHost(p.host);
      setPort(p.port);
      setSecure(p.secure);
      setInboxMailbox(p.inboxMailbox);
      setSentMailbox(p.sentMailbox);
    }
  };

  const onUserBlur = async () => {
    if (host || !user.includes('@')) return;
    try {
      const { preset, config } = await detectPreset(user);
      if (preset && config) {
        setPresetKey(preset);
        setHost(config.host); setPort(config.port); setSecure(config.secure);
        setInboxMailbox(config.inboxMailbox); setSentMailbox(config.sentMailbox);
      }
    } catch { /* ignore */ }
  };

  const submit = e => {
    e.preventDefault();
    onScan({
      host, port: Number(port), secure,
      user, pass, scan,
      inboxMailbox, sentMailbox,
      since: since || null, before: before || null,
      maxPerFolder: Number(maxPerFolder),
      filters: {
        excludeDomains: excludeDomains.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        excludeNoReply, requireName
      }
    });
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Connection</h2>

      <div className="field">
        <label>Provider preset</label>
        <select value={presetKey} onChange={e => applyPreset(e.target.value)}>
          <option value="">Custom / auto-detect</option>
          {presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      <div className="field">
        <label>Email address</label>
        <input type="email" required value={user} onChange={e => setUser(e.target.value)} onBlur={onUserBlur} placeholder="you@example.com" autoComplete="email" />
      </div>

      <div className="field">
        <label>Password / App password</label>
        <input type="password" required value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
      </div>

      <div className="row3">
        <div className="field">
          <label>IMAP host</label>
          <input required value={host} onChange={e => setHost(e.target.value)} placeholder="imap.example.com" />
        </div>
        <div className="field">
          <label>Port</label>
          <input type="number" required value={port} onChange={e => setPort(e.target.value)} />
        </div>
        <div className="field">
          <label>TLS</label>
          <select value={secure ? '1' : '0'} onChange={e => setSecure(e.target.value === '1')}>
            <option value="1">SSL/TLS</option>
            <option value="0">STARTTLS / none</option>
          </select>
        </div>
      </div>

      <h2 style={{ marginTop: 10 }}>Scan</h2>

      <div className="field">
        <label>Folders to scan</label>
        <div className="toggle-row">
          {SCAN_MODES.map(m => (
            <div key={m.key} className={`toggle ${scan === m.key ? 'active' : ''}`} onClick={() => setScan(m.key)}>{m.label}</div>
          ))}
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>Inbox folder</label>
          <input value={inboxMailbox} onChange={e => setInboxMailbox(e.target.value)} />
        </div>
        <div className="field">
          <label>Sent folder</label>
          <input value={sentMailbox} onChange={e => setSentMailbox(e.target.value)} />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>Since (optional)</label>
          <input type="date" value={since} onChange={e => setSince(e.target.value)} />
        </div>
        <div className="field">
          <label>Before (optional)</label>
          <input type="date" value={before} onChange={e => setBefore(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>Max messages per folder</label>
        <input type="number" min="10" max="5000" value={maxPerFolder} onChange={e => setMaxPerFolder(e.target.value)} />
      </div>

      <h2 style={{ marginTop: 10 }}>Filters</h2>
      <div className="field">
        <label>Exclude domains (comma-separated)</label>
        <input value={excludeDomains} onChange={e => setExcludeDomains(e.target.value)} placeholder="newsletter.com, noreply.io" />
      </div>
      <label className="checkbox" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={excludeNoReply} onChange={e => setExcludeNoReply(e.target.checked)} />
        Skip no-reply / mailer-daemon addresses
      </label>
      <label className="checkbox" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={requireName} onChange={e => setRequireName(e.target.checked)} />
        Only keep contacts that have a display name
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        {scanning ? (
          <button type="button" className="btn" onClick={onCancel}>Cancel scan</button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              disabled={testing || !host || !user || !pass}
              onClick={async () => {
                setTesting(true);
                setTestResult(null);
                const r = await testConnection({ host, port: Number(port), secure, user, pass });
                setTestResult(r);
                setTesting(false);
              }}
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button type="submit" className="btn primary" style={{ flex: 1 }}>Start scan</button>
          </>
        )}
      </div>

      {testResult && (
        <div style={{ marginTop: 12, fontSize: 12 }}>
          {testResult.ok ? (
            <>
              <span className="pill success">Connected</span>
              <div style={{ color: 'var(--muted)', marginTop: 6 }}>
                Server: {testResult.server || 'unknown'} · {testResult.mailboxes?.length || 0} mailboxes
              </div>
              {testResult.mailboxes?.length > 0 && (
                <div style={{ color: '#b9c3e6', marginTop: 6, fontFamily: 'ui-monospace, monospace', maxHeight: 120, overflow: 'auto' }}>
                  {testResult.mailboxes.map(m => (
                    <div key={m.path}>{m.path}{m.specialUse ? ` [${m.specialUse}]` : ''}</div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <span className="pill danger">Failed</span>
              <div style={{ marginTop: 6 }}>{testResult.error}</div>
              {testResult.raw && testResult.raw !== testResult.error && (
                <div style={{ color: 'var(--muted)', marginTop: 4 }}>{testResult.raw}</div>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
}
