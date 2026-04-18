import React, { useMemo, useState } from 'react';

const COLS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'count', label: 'Total', num: true },
  { key: 'sent', label: 'Sent', num: true },
  { key: 'received', label: 'Recv', num: true },
  { key: 'lastSeen', label: 'Last contact' },
  { key: 'domain', label: 'Domain' }
];

function fmt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toISOString().slice(0, 10);
}

export default function ContactsTable({ contacts }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'count', dir: 'desc' });

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
        <input type="search" placeholder="Search by name, email, or domain…" value={q} onChange={e => setQ(e.target.value)} />
        <span className="pill">{rows.length} shown</span>
      </div>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">No contacts match your search.</div>
        ) : (
          <table>
            <thead>
              <tr>
                {COLS.map(c => (
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
                  <td>{c.name || <span style={{ color: '#8a93b2' }}>—</span>}</td>
                  <td>{c.email}</td>
                  <td className="num">{c.count}</td>
                  <td className="num">{c.sent}</td>
                  <td className="num">{c.received}</td>
                  <td>{fmt(c.lastSeen)}</td>
                  <td>{c.domain}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > 500 && (
        <div className="footer">Showing first 500 of {rows.length}. Export for the full list.</div>
      )}
    </>
  );
}
