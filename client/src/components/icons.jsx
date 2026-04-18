import React from 'react';

const I = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const IconUser = props => <I {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 0 1 16 0v1" /></I>;
export const IconMail = props => <I {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></I>;
export const IconLock = props => <I {...props}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></I>;
export const IconServer = props => <I {...props}><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><circle cx="7" cy="7.5" r="0.8" fill="currentColor" /><circle cx="7" cy="16.5" r="0.8" fill="currentColor" /></I>;
export const IconScan = props => <I {...props}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><line x1="3" y1="12" x2="21" y2="12" /></I>;
export const IconFilter = props => <I {...props}><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" /></I>;
export const IconCalendar = props => <I {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></I>;
export const IconInbox = props => <I {...props}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5 7h14l3 5v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7z" /></I>;
export const IconSend = props => <I {...props}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></I>;
export const IconBoth = props => <I {...props}><path d="M7 10l-4 4 4 4" /><path d="M3 14h11a4 4 0 0 0 4-4V6" /><path d="M17 14l4-4-4-4" /></I>;
export const IconPlay = props => <I {...props}><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" /></I>;
export const IconStop = props => <I {...props}><rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" /></I>;
export const IconCheck = props => <I {...props}><polyline points="20 6 9 17 4 12" /></I>;
export const IconX = props => <I {...props}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></I>;
export const IconHash = props => <I {...props}><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></I>;
export const IconShield = props => <I {...props}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" /></I>;
