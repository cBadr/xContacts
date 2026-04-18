# xContacts

Professional email contact extractor. Connect to any IMAP mailbox, scan Inbox / Sent / both, and harvest contacts with frequency, first-seen and last-seen metadata. Export to CSV, JSON or VCF.

## Features

- IMAP over TLS (Gmail, Outlook/Office365, Yahoo, iCloud, custom servers)
- Scan **Inbox**, **Sent**, or **Both** folders
- Live progress streaming via Server-Sent Events
- Smart deduplication, frequency count, first/last contact date
- Filters: date range, max messages, excluded domains, name-required
- Search, sort and multi-select in UI
- Export CSV / JSON / VCF (vCard 3.0)
- Zero credential storage — session-only, held in memory

## Quick start

```bash
npm run install:all
npm run dev
```

- Backend: http://localhost:5174
- Frontend: http://localhost:5173

## Gmail / Outlook notes

- **Gmail**: use an App Password (Account → Security → 2-Step Verification → App passwords). Host: `imap.gmail.com`, Port: `993`.
- **Outlook/Office 365**: `outlook.office365.com:993`. Requires modern-auth in some tenants.
- **Yahoo**: App Password required. `imap.mail.yahoo.com:993`.

## Architecture

```
xContacts/
├── server/   Node.js + Express + imapflow + mailparser
└── client/   React + Vite UI
```

## Disclaimer

Use only on mailboxes you own or have explicit permission to access.
