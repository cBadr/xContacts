import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { accountExportUrl, exportAllUrl, exportUrl } from '../api.js';

export default function ExportMenu({ accountId, token, hasMultipleAccounts }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState('account'); // 'account' | 'all'
  const ref = useRef(null);

  useEffect(() => {
    const onClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const buildUrl = fmt => {
    if (scope === 'all') return exportAllUrl(fmt);
    if (accountId) return accountExportUrl(accountId, fmt);
    if (token) return exportUrl(token, fmt);
    return '#';
  };

  const canExport = scope === 'all' || accountId || token;

  return (
    <div className="export-menu" ref={ref}>
      <button type="button" className="btn export-toggle" onClick={() => setOpen(v => !v)} disabled={!canExport}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>{t('exportCsv').split(' ')[0]}…</span>
      </button>

      {open && (
        <div className="export-dropdown">
          {hasMultipleAccounts && (
            <div className="export-scope">
              <button type="button" className={`export-scope-btn ${scope === 'account' ? 'active' : ''}`} onClick={() => setScope('account')}>
                {t('exportThis')}
              </button>
              <button type="button" className={`export-scope-btn ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>
                {t('exportAll')}
              </button>
            </div>
          )}
          <a className="export-item" href={buildUrl('csv')} download onClick={() => setOpen(false)}>
            <span className="export-fmt">CSV</span>
            <span className="export-item-label">{t('exportCsv')}</span>
          </a>
          <a className="export-item" href={buildUrl('json')} download onClick={() => setOpen(false)}>
            <span className="export-fmt">JSON</span>
            <span className="export-item-label">{t('exportJson')}</span>
          </a>
          <a className="export-item" href={buildUrl('vcf')} download onClick={() => setOpen(false)}>
            <span className="export-fmt">VCF</span>
            <span className="export-item-label">{t('exportVcf')}</span>
          </a>
          <a className="export-item" href={buildUrl('txt')} download onClick={() => setOpen(false)}>
            <span className="export-fmt">TXT</span>
            <span className="export-item-label">{t('exportTxt')}</span>
          </a>
          {scope === 'all' && (
            <div className="export-hint">{t('exportAllHint')}</div>
          )}
        </div>
      )}
    </div>
  );
}
