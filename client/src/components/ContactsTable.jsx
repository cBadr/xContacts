import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n.jsx';

function fmt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toISOString().slice(0, 10);
}

export default function ContactsTable({ contacts }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'count', dir: 'desc' });

  const cols = [
    { key: 'name', label: t('colName') },
    { key: 'email', label: t('colEmail') },
    { key: 'count', label: t('colTotal'), num: true },
    { key: 'sent', label: t('colSent'), num: true },
    { key: 'received', label: t('colReceived'), num: true },
    { key: 'mentioned', label: t('colMentioned'), num: true },
    { key: 'lastSeen', label: t('colLast') },
    { key: 'domain', label: t('colDomain') },
    { key: 'sources', label: t('colSource') }
  ];

  const sourceBadge = src => {
    if (src.startsWith('google')) return { label: 'G', cls: 'src-google' };
    if (src.startsWith('ms')) return { label: 'M', cls: 'src-ms' };
    if (src === 'headers') return { label: 'H', cls: 'src-header' };
    if (src === 'body') return { label: 'B', cls: 'src-body' };
    if (src === 'address-book') return { label: 'A', cls: 'src-ab' };
    return { label: '·', cls: '' };
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = contacts;
    if (needle) {
      list = list.filter(c =>
        c.email.toLowerCase().includes(needle) ||
        (c.name || '').toLowerCase().includes(needle) ||
        (c.domain || '').toLowerCase().includes(needle)
      );
    }
    const { key, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
  }, [contacts, q, sort]);

  const toggleSort = key => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  return (
    <>
      <div className="toolbar">
        <input type="search" placeholder={t('searchPh')} value={q} onChange={e => setQ(e.target.value)} />
        <span className="pill">{t('shown', { n: rows.length })}</span>
      </div>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">{t('empty')}</div>
        ) : (
          <table>
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} className={c.num ? 'num' : ''}>
                    {c.label}
                    {sort.key === c.key && <span className="arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map(c => (
                <tr key={c.email}>
                  <td>{c.name || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td>{c.email}</td>
                  <td className="num">{c.count}</td>
                  <td className="num">{c.sent}</td>
                  <td className="num">{c.received}</td>
                  <td className="num">{c.mentioned || 0}</td>
                  <td>{fmt(c.lastSeen)}</td>
                  <td>{c.domain}</td>
                  <td>
                    <div className="src-badges">
                      {(c.sources || []).map(s => {
                        const b = sourceBadge(s);
                        return <span key={s} className={`src-badge ${b.cls}`} title={s}>{b.label}</span>;
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > 500 && (
        <div className="footer">{t('showingFirst', { n: rows.length })}</div>
      )}
    </>
  );
}
