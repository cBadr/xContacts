export const IMAP_PRESETS = {
  gmail: {
    label: 'Gmail',
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    sentMailbox: '[Gmail]/Sent Mail',
    inboxMailbox: 'INBOX'
  },
  outlook: {
    label: 'Outlook / Office 365',
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    sentMailbox: 'Sent',
    inboxMailbox: 'INBOX'
  },
  yahoo: {
    label: 'Yahoo Mail',
    host: 'imap.mail.yahoo.com',
    port: 993,
    secure: true,
    sentMailbox: 'Sent',
    inboxMailbox: 'INBOX'
  },
  icloud: {
    label: 'iCloud Mail',
    host: 'imap.mail.me.com',
    port: 993,
    secure: true,
    sentMailbox: 'Sent Messages',
    inboxMailbox: 'INBOX'
  },
  yandex: {
    label: 'Yandex Mail',
    host: 'imap.yandex.com',
    port: 993,
    secure: true,
    sentMailbox: 'Sent',
    inboxMailbox: 'INBOX'
  },
  comcast: {
    label: 'Comcast / Xfinity',
    host: 'imap.comcast.net',
    port: 993,
    secure: true,
    sentMailbox: 'Sent',
    inboxMailbox: 'INBOX'
  },
  windstream: {
    label: 'Windstream / Kinetic',
    host: 'imap.windstream.net',
    port: 993,
    secure: true,
    sentMailbox: 'Sent',
    inboxMailbox: 'INBOX'
  },
  aol: {
    label: 'AOL Mail',
    host: 'imap.aol.com',
    port: 993,
    secure: true,
    sentMailbox: 'Sent',
    inboxMailbox: 'INBOX'
  }
};

export function detectPreset(email) {
  const domain = (email || '').split('@')[1]?.toLowerCase() || '';
  if (/gmail\.com|googlemail\.com/.test(domain)) return 'gmail';
  if (/outlook\.|hotmail\.|live\.|msn\.|office365/.test(domain)) return 'outlook';
  if (/yahoo\./.test(domain)) return 'yahoo';
  if (/icloud\.com|me\.com|mac\.com/.test(domain)) return 'icloud';
  if (/yandex\./.test(domain)) return 'yandex';
  if (/comcast\.net|xfinity\.com/.test(domain)) return 'comcast';
  if (/windstream\.net|kinetic(mail)?\.com/.test(domain)) return 'windstream';
  if (/aol\.com|aim\.com/.test(domain)) return 'aol';
  return null;
}
