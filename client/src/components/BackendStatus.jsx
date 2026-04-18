import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n.jsx';

const BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/+$/, '');

export default function BackendStatus() {
  const { t, lang } = useI18n();
  const [state, setState] = useState({ status: 'checking' });

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const r = await fetch(`${BASE}/api/health`, { signal: controller.signal });
        clearTimeout(timer);
        if (!alive) return;
        if (r.ok) {
          const data = await r.json().catch(() => ({}));
          setState({ status: 'ok', version: data.version });
        } else {
          setState({ status: 'error', code: r.status });
        }
      } catch (e) {
        if (!alive) return;
        setState({ status: 'down', error: e.message });
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (state.status === 'ok' || state.status === 'checking') return null;

  const isConfigured = BASE.length > 0;
  const msg = lang === 'ar'
    ? (isConfigured
        ? `لا يمكن الوصول إلى الخادم على ${BASE}. تأكّد من أنه يعمل وأن CORS يسمح لهذا الموقع.`
        : 'لم يُضبط عنوان الخادم (VITE_API_URL). الفرونت منشور لكن الباك إند غير متصل — الفحص والـProviders لن يعمل.')
    : (isConfigured
        ? `Cannot reach backend at ${BASE}. Make sure it's running and CORS allows this origin.`
        : 'No backend URL configured (VITE_API_URL). The frontend is deployed but the backend is not connected — scans and providers won\'t work.');

  return (
    <div className="backend-banner">
      <div className="backend-banner-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div className="backend-banner-body">
        <div className="backend-banner-title">
          {lang === 'ar' ? 'الباك إند غير متاح' : 'Backend unreachable'}
        </div>
        <div className="backend-banner-text">{msg}</div>
        <div className="backend-banner-actions">
          <a href="https://github.com/YOU/xcontacts/blob/main/DEPLOY.md" target="_blank" rel="noreferrer" className="backend-banner-link">
            {lang === 'ar' ? 'دليل النشر' : 'Deployment guide'} →
          </a>
          <button type="button" className="backend-banner-link" onClick={() => window.location.reload()}>
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      </div>
    </div>
  );
}
