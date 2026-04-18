import React from 'react';
import { useTheme } from '../theme.jsx';
import { useI18n } from '../i18n.jsx';

export default function TopBar() {
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();

  return (
    <div className="topbar">
      <div className="brand">
        <div className="logo">x</div>
        <div>
          <h1>{t('appTitle')}</h1>
          <div className="tag">{t('appTag')}</div>
        </div>
      </div>
      <div className="topbar-actions">
        <button className="lang-switch" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} title={t('language')}>
          {lang === 'en' ? 'العربية' : 'EN'}
        </button>
        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={t('theme')} aria-label={t('theme')}>
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
