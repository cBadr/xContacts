import React from 'react';
import { useI18n } from '../i18n.jsx';
import { IconUser, IconX } from './icons.jsx';

function timeAgo(ts, lang) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return lang === 'ar' ? 'الآن' : 'just now';
  if (m < 60) return lang === 'ar' ? `منذ ${m} دقيقة` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === 'ar' ? `منذ ${h} ساعة` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return lang === 'ar' ? `منذ ${d} يوم` : `${d}d ago`;
}

export default function AccountsBar({ accounts, activeId, onSelect, onDelete }) {
  const { t, lang } = useI18n();
  if (!accounts.length) return null;

  return (
    <div className="accounts-bar">
      <div className="accounts-bar-head">
        <IconUser size={14} />
        <span>{t('savedAccounts')}</span>
        <span className="accounts-count">{accounts.length}</span>
      </div>
      <div className="accounts-scroll">
        {accounts.map(a => (
          <div
            key={a.id}
            className={`account-chip ${activeId === a.id ? 'active' : ''}`}
            onClick={() => onSelect(a.id)}
          >
            <div className="account-avatar">{(a.email || '?')[0].toUpperCase()}</div>
            <div className="account-info">
              <div className="account-email" title={a.email}>{a.email}</div>
              <div className="account-meta">
                <span>{a.contact_count} {t('statContacts').toLowerCase()}</span>
                <span>·</span>
                <span>{timeAgo(a.last_scan_at, lang)}</span>
              </div>
            </div>
            <button
              type="button"
              className="account-del"
              onClick={e => { e.stopPropagation(); onDelete(a.id); }}
              title={t('deleteAccount')}
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
