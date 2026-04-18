import React, { useEffect, useState } from 'react';
import { getPresets, detectPreset, testConnection, getOAuthProviders, startOAuth, getOAuthToken, revokeOAuth } from '../api.js';
import { useI18n } from '../i18n.jsx';
import Section from './Section.jsx';
import FolderPicker from './FolderPicker.jsx';
import {
  IconUser, IconMail, IconLock, IconServer, IconScan, IconFilter,
  IconCalendar, IconInbox, IconSend, IconPlay, IconStop,
  IconCheck, IconX, IconHash, IconShield
} from './icons.jsx';

const PROVIDER_ICONS = {
  google: (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.2 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.8l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.8l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5c-7.2 0-13.4 4-16.6 9.9z" />
      <path fill="#4CAF50" d="M24 43.5c5.1 0 9.7-1.9 13.2-5.1l-6.1-5c-2 1.5-4.4 2.4-7.1 2.4-5.2 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.4 39.4 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.1 5c-.4.4 6.6-4.8 6.6-14.7 0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  ),
  microsoft: (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <rect x="4" y="4" width="18" height="18" fill="#F25022" />
      <rect x="26" y="4" width="18" height="18" fill="#7FBA00" />
      <rect x="4" y="26" width="18" height="18" fill="#00A4EF" />
      <rect x="26" y="26" width="18" height="18" fill="#FFB900" />
    </svg>
  )
};

function Field({ icon, label, children, hint }) {
  return (
    <div className="field-pro">
      <label>
        {icon && <span className="field-icon">{icon}</span>}
        <span>{label}</span>
      </label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export default function ConnectPanel({ onScan, scanning, onCancel, prefill, activeAccountId }) {
  const { t } = useI18n();
  const [presets, setPresets] = useState([]);
  const [oauthProviders, setOauthProviders] = useState([]);
  const [presetKey, setPresetKey] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(993);
  const [secure, setSecure] = useState(true);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
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
  const [oauth, setOauth] = useState(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState('');
  const [incremental, setIncremental] = useState(false);
  const [folders, setFolders] = useState([]);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    getPresets().then(setPresets).catch(() => {});
    getOAuthProviders().then(setOauthProviders).catch(() => {});
  }, []);

  useEffect(() => {
    if (!prefill) return;
    setUser(prefill.email || '');
    setHost(prefill.host || '');
    setPort(prefill.port || 993);
    setSecure(!!prefill.secure);
    setInboxMailbox(prefill.inboxMailbox || 'INBOX');
    setSentMailbox(prefill.sentMailbox || 'Sent');
    setIncremental(!!prefill.lastScanAt);
    setPass('');
    setOauth(null);
    setTestResult(null);
  }, [prefill?.email]);

  const applyPreset = key => {
    setPresetKey(key);
    const p = presets.find(x => x.key === key);
    if (p) {
      setHost(p.host); setPort(p.port); setSecure(p.secure);
      setInboxMailbox(p.inboxMailbox); setSentMailbox(p.sentMailbox);
    }
  };

  const onUserBlur = async () => {
    if (host || !user.includes('@') || oauth) return;
    try {
      const { preset, config } = await detectPreset(user);
      if (preset && config) {
        setPresetKey(preset);
        setHost(config.host); setPort(config.port); setSecure(config.secure);
        setInboxMailbox(config.inboxMailbox); setSentMailbox(config.sentMailbox);
      }
    } catch { /* ignore */ }
  };

  const doOAuth = async provider => {
    setOauthBusy(true); setOauthError('');
    try {
      const result = await startOAuth(provider);
      setOauth({
        session: result.session, provider: result.provider, email: result.email,
        imap: result.imap, expiresAt: result.expiresAt
      });
      if (result.email) setUser(result.email);
      if (result.imap) {
        setHost(result.imap.host); setPort(result.imap.port); setSecure(result.imap.secure);
        setInboxMailbox(result.imap.inboxMailbox); setSentMailbox(result.imap.sentMailbox);
      }
      setPass('');
    } catch (e) { setOauthError(e.message); }
    finally { setOauthBusy(false); }
  };

  const signOut = async () => {
    if (oauth?.session) await revokeOAuth(oauth.session);
    setOauth(null);
  };

  const submit = async e => {
    e.preventDefault();
    let accessToken;
    if (oauth) {
      try {
        const tk = await getOAuthToken(oauth.session);
        accessToken = tk.accessToken;
      } catch (err) { setOauthError(err.message); return; }
    }
    const selectedFolders = folders.filter(f => f.selected).map(f => ({ path: f.path, direction: f.direction }));

    onScan({
      host, port: Number(port), secure, user,
      pass: oauth ? undefined : pass, accessToken,
      scan, inboxMailbox, sentMailbox,
      folders: selectedFolders.length ? selectedFolders : undefined,
      since: since || null, before: before || null,
      maxPerFolder: Number(maxPerFolder),
      filters: {
        excludeDomains: excludeDomains.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        excludeNoReply, requireName
      },
      saveAccount: true,
      incremental,
      accountId: activeAccountId || undefined
    });
  };

  const runTest = async () => {
    setTesting(true); setTestResult(null);
    let body = { host, port: Number(port), secure, user };
    if (oauth) {
      try {
        const tk = await getOAuthToken(oauth.session);
        body.accessToken = tk.accessToken;
      } catch (err) { setTestResult({ ok: false, error: err.message }); setTesting(false); return; }
    } else body.pass = pass;
    const r = await testConnection(body);
    setTestResult(r);
    if (r.ok && Array.isArray(r.folders)) setFolders(r.folders);
    setTesting(false);
  };

  const discoverFolders = async () => {
    if (!host || !user || (!pass && !oauth)) {
      setTestResult({ ok: false, error: 'Enter credentials first.' });
      return;
    }
    setDiscovering(true);
    let body = { host, port: Number(port), secure, user };
    if (oauth) {
      try {
        const tk = await getOAuthToken(oauth.session);
        body.accessToken = tk.accessToken;
      } catch (err) { setDiscovering(false); setTestResult({ ok: false, error: err.message }); return; }
    } else body.pass = pass;
    const r = await testConnection(body);
    if (r.ok && Array.isArray(r.folders)) { setFolders(r.folders); setTestResult({ ok: true, server: r.server, mailboxes: r.mailboxes }); }
    else setTestResult(r);
    setDiscovering(false);
  };

  const canSubmit = host && user && (pass || oauth);

  return (
    <form className="panel-pro" onSubmit={submit}>
      <div className="panel-glow" aria-hidden />

      {oauthProviders.length > 0 && !oauth && (
        <div className="oauth-block">
          <div className="oauth-block-head">
            <IconShield />
            <div>
              <div className="oauth-block-title">{t('signInWith')}</div>
              <div className="oauth-block-sub">One-click OAuth · no passwords stored</div>
            </div>
          </div>
          <div className="oauth-row">
            {oauthProviders.map(p => (
              <button key={p.key} type="button" className={`oauth-btn-pro ${p.key}`} disabled={oauthBusy}
                onClick={() => doOAuth(p.key)}>
                <span className="oauth-btn-icon">{PROVIDER_ICONS[p.key]}</span>
                <span className="oauth-btn-label">{oauthBusy ? t('opening') : t('continueWith', { name: p.label })}</span>
                <span className="oauth-btn-arrow" aria-hidden>→</span>
              </button>
            ))}
          </div>
          {oauthError && <div className="alert alert-danger"><IconX /> {oauthError}</div>}
          <div className="divider"><span>{t('orCreds')}</span></div>
        </div>
      )}

      {oauth && (
        <div className="oauth-chip-pro">
          <div className="oauth-chip-avatar">{PROVIDER_ICONS[oauth.provider]}</div>
          <div className="oauth-chip-info">
            <div className="oauth-chip-email">{oauth.email}</div>
            <div className="oauth-chip-meta">
              <IconCheck size={12} />
              {t('signedInVia', { name: oauth.provider === 'google' ? 'Google' : 'Microsoft' })}
            </div>
          </div>
          <button type="button" className="btn-ghost-sm" onClick={signOut} title={t('signOut')}>
            <IconX size={14} />
          </button>
        </div>
      )}

      <Section icon={<IconUser />} title={t('connection')} defaultOpen>
        <Field icon={<IconServer />} label={t('provider')}>
          <select className="input-pro" value={presetKey} onChange={e => applyPreset(e.target.value)} disabled={!!oauth}>
            <option value="">{t('custom')}</option>
            {presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>

        <Field icon={<IconMail />} label={t('email')}>
          <input className="input-pro" type="email" required value={user}
            onChange={e => setUser(e.target.value)} onBlur={onUserBlur}
            placeholder="you@example.com" autoComplete="email" disabled={!!oauth} />
        </Field>

        {!oauth && (
          <Field icon={<IconLock />} label={t('password')}>
            <div className="input-group">
              <input className="input-pro" type={showPass ? 'text' : 'password'} required
                value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••"
                autoComplete="current-password" />
              <button type="button" className="input-addon" onClick={() => setShowPass(v => !v)} tabIndex={-1}>
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
        )}

        <div className="grid-3">
          <Field icon={<IconServer />} label={t('imapHost')}>
            <input className="input-pro" required value={host} onChange={e => setHost(e.target.value)}
              placeholder="imap.example.com" disabled={!!oauth} />
          </Field>
          <Field icon={<IconHash />} label={t('port')}>
            <input className="input-pro" type="number" required value={port}
              onChange={e => setPort(e.target.value)} disabled={!!oauth} />
          </Field>
          <Field icon={<IconShield />} label={t('tls')}>
            <select className="input-pro" value={secure ? '1' : '0'}
              onChange={e => setSecure(e.target.value === '1')} disabled={!!oauth}>
              <option value="1">{t('sslTls')}</option>
              <option value="0">{t('starttls')}</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section icon={<IconScan />} title={t('scan')} defaultOpen badge={folders.filter(f => f.selected).length || null}>
        <Field label={t('foldersToScan')}>
          <FolderPicker
            folders={folders}
            onChange={setFolders}
            onDiscover={discoverFolders}
            loading={discovering}
          />
        </Field>

        <div className="grid-2">
          <Field icon={<IconCalendar />} label={t('since')}>
            <input className="input-pro" type="date" value={since} onChange={e => setSince(e.target.value)} />
          </Field>
          <Field icon={<IconCalendar />} label={t('before')}>
            <input className="input-pro" type="date" value={before} onChange={e => setBefore(e.target.value)} />
          </Field>
        </div>

        <Field icon={<IconHash />} label={t('maxMsgs')}>
          <input className="input-pro" type="number" min="10" max="5000"
            value={maxPerFolder} onChange={e => setMaxPerFolder(e.target.value)} />
        </Field>

        {activeAccountId && (
          <label className="switch-row">
            <div>
              <div>{t('incremental')}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginTop: 2 }}>{t('incrementalHint')}</div>
            </div>
            <span className={`switch ${incremental ? 'on' : ''}`} onClick={() => setIncremental(v => !v)}>
              <span className="switch-thumb" />
            </span>
          </label>
        )}
      </Section>

      <Section icon={<IconFilter />} title={t('filters')} defaultOpen={false}>
        <Field label={t('excludeDomains')}>
          <input className="input-pro" value={excludeDomains}
            onChange={e => setExcludeDomains(e.target.value)}
            placeholder="newsletter.com, noreply.io" />
        </Field>
        <label className="switch-row">
          <span>{t('skipNoReply')}</span>
          <span className={`switch ${excludeNoReply ? 'on' : ''}`} onClick={() => setExcludeNoReply(v => !v)}>
            <span className="switch-thumb" />
          </span>
          <input type="checkbox" checked={excludeNoReply} onChange={() => {}} hidden />
        </label>
        <label className="switch-row">
          <span>{t('requireName')}</span>
          <span className={`switch ${requireName ? 'on' : ''}`} onClick={() => setRequireName(v => !v)}>
            <span className="switch-thumb" />
          </span>
          <input type="checkbox" checked={requireName} onChange={() => {}} hidden />
        </label>
      </Section>

      <div className="form-actions">
        {scanning ? (
          <button type="button" className="btn-action btn-danger" onClick={onCancel}>
            <IconStop /> {t('cancelScan')}
          </button>
        ) : (
          <>
            <button type="button" className="btn-action btn-secondary"
              disabled={testing || !host || !user || (!pass && !oauth)} onClick={runTest}>
              {testing ? <><span className="spinner" /> {t('testing')}</> : <><IconCheck /> {t('testConnection')}</>}
            </button>
            <button type="submit" className="btn-action btn-primary" disabled={!canSubmit}>
              <IconPlay /> {t('startScan')}
            </button>
          </>
        )}
      </div>

      {testResult && (
        <div className={`alert ${testResult.ok ? 'alert-success' : 'alert-danger'}`}>
          {testResult.ok ? <IconCheck /> : <IconX />}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>
              {testResult.ok ? t('connected') : t('failed')}
            </div>
            {testResult.ok ? (
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                {testResult.server || 'IMAP'} · {t('mailboxes', { n: testResult.mailboxes?.length || 0 })}
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{testResult.error}</div>
            )}
            {testResult.ok && testResult.mailboxes?.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 11, opacity: 0.8 }}>Show mailboxes</summary>
                <div className="mailbox-list">
                  {testResult.mailboxes.map(m => (
                    <div key={m.path}>{m.path}{m.specialUse ? ` · ${m.specialUse}` : ''}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
