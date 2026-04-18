import React, { useRef, useState, useEffect } from 'react';

export default function Section({ icon, title, children, defaultOpen = true, collapsible = true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyRef = useRef(null);
  const [height, setHeight] = useState(defaultOpen ? 'auto' : 0);

  useEffect(() => {
    if (!bodyRef.current) return;
    if (open) {
      const h = bodyRef.current.scrollHeight;
      setHeight(h);
      const t = setTimeout(() => setHeight('auto'), 280);
      return () => clearTimeout(t);
    } else {
      const h = bodyRef.current.scrollHeight;
      setHeight(h);
      requestAnimationFrame(() => setHeight(0));
    }
  }, [open]);

  return (
    <div className={`section ${open ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="section-head"
        onClick={() => collapsible && setOpen(v => !v)}
        tabIndex={collapsible ? 0 : -1}
      >
        <span className="section-icon">{icon}</span>
        <span className="section-title">{title}</span>
        {badge && <span className="section-badge">{badge}</span>}
        {collapsible && (
          <svg className="section-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      <div className="section-body-wrap" style={{ height: height === 'auto' ? 'auto' : `${height}px` }}>
        <div ref={bodyRef} className="section-body">{children}</div>
      </div>
    </div>
  );
}
