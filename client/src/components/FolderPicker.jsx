import React from 'react';
import { useI18n } from '../i18n.jsx';
import { IconInbox, IconSend, IconCheck } from './icons.jsx';

const SPECIAL_LABELS = {
  '\\Inbox': 'Inbox',
  '\\Sent': 'Sent',
  '\\Trash': 'Trash',
  '\\Junk': 'Junk',
  '\\Drafts': 'Drafts',
  '\\Archive': 'Archive',
  '\\All': 'All Mail',
  '\\Flagged': 'Flagged',
  '\\Important': 'Important'
};

export default function FolderPicker({ folders, onChange, onDiscover, loading }) {
  const { t } = useI18n();
  const hasFolders = Array.isArray(folders) && folders.length > 0;

  if (!hasFolders) {
    return (
      <div className="folder-empty">
        <div className="folder-empty-text">
          {t('folderEmpty')}
        </div>
        <button type="button" className="btn-action btn-secondary" onClick={onDiscover} disabled={loading}>
          {loading ? <><span className="spinner" /> {t('discovering')}</> : <><IconCheck size={14} /> {t('discoverFolders')}</>}
        </button>
      </div>
    );
  }

  const selectedCount = folders.filter(f => f.selected).length;
  const allSelected = selectedCount === folders.length;
  const sentCount = folders.filter(f => f.selected && f.direction === 'sent').length;
  const inboxCount = folders.filter(f => f.selected && f.direction === 'inbox').length;

  const toggleAll = () => {
    onChange(folders.map(f => ({ ...f, selected: !allSelected })));
  };
  const toggleOne = idx => {
    onChange(folders.map((f, i) => i === idx ? { ...f, selected: !f.selected } : f));
  };
  const toggleDirection = idx => {
    onChange(folders.map((f, i) => i === idx ? { ...f, direction: f.direction === 'sent' ? 'inbox' : 'sent' } : f));
  };

  return (
    <div className="folder-picker">
      <div className="folder-picker-head">
        <button type="button" className="folder-all" onClick={toggleAll}>
          <span className={`folder-check ${allSelected ? 'on' : selectedCount > 0 ? 'mixed' : ''}`}>
            {allSelected ? <IconCheck size={12} /> : selectedCount > 0 ? <span className="dash" /> : null}
          </span>
          <span>{allSelected ? t('deselectAll') : t('selectAll')}</span>
        </button>
        <div className="folder-stats">
          <span className="pill pill-inbox"><IconInbox size={11} /> {inboxCount}</span>
          <span className="pill pill-sent"><IconSend size={11} /> {sentCount}</span>
          <button type="button" className="folder-refresh" onClick={onDiscover} disabled={loading} title={t('refresh')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="folder-list">
        {folders.map((f, i) => (
          <label key={f.path} className={`folder-item ${f.selected ? 'selected' : ''}`}>
            <span className={`folder-check ${f.selected ? 'on' : ''}`} onClick={e => { e.preventDefault(); toggleOne(i); }}>
              {f.selected && <IconCheck size={12} />}
            </span>
            <div className="folder-name" onClick={e => { e.preventDefault(); toggleOne(i); }}>
              <span className="folder-path">{f.path}</span>
              {f.specialUse && SPECIAL_LABELS[f.specialUse] && (
                <span className="folder-special">{SPECIAL_LABELS[f.specialUse]}</span>
              )}
            </div>
            <button
              type="button"
              className={`folder-dir ${f.direction}`}
              onClick={e => { e.stopPropagation(); e.preventDefault(); toggleDirection(i); }}
              title={t('toggleDirection')}
            >
              {f.direction === 'sent' ? <><IconSend size={11} /> {t('dirSent')}</> : <><IconInbox size={11} /> {t('dirInbox')}</>}
            </button>
          </label>
        ))}
      </div>
    </div>
  );
}
