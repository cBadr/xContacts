# xContacts

Professional email contact extractor. Connect to any IMAP mailbox, scan Inbox / Sent / both, and harvest contacts with frequency, first-seen and last-seen metadata. Export to CSV, JSON or VCF.

## Features

- **OAuth2 sign-in** for Gmail and Microsoft (Outlook/Office 365) — no passwords needed
- IMAP over TLS fallback (Yahoo, iCloud, Comcast, Windstream, custom servers)
- Scan **Inbox**, **Sent**, or **Both** folders
- Live progress streaming via Server-Sent Events
- Smart deduplication, frequency count, first/last contact date
- Filters: date range, max messages, excluded domains, name-required
- Search, sort and multi-select in UI
- Export CSV / JSON / VCF (vCard 3.0)
- **Arabic + English UI** with full RTL support, **Light + Dark theme**
- Zero credential storage — session-only, held in memory

## Setting up OAuth2

OAuth lets users sign in with one click and avoids IMAP blacklisting entirely.

### Google (Gmail)
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create a new OAuth client ID → **Web application**.
3. Authorized redirect URI: `http://localhost:5174/api/oauth/callback`
4. Enable the **Gmail API** on the project.
5. Copy the Client ID + Secret into `server/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

### Microsoft (Outlook / Office 365)
1. Go to [Entra App registrations](https://entra.microsoft.com) → **New registration**.
2. Supported account types: *Personal + work* (common tenant).
3. Redirect URI (Web): `http://localhost:5174/api/oauth/callback`
4. API permissions → add **IMAP.AccessAsUser.All**, **offline_access**, **email**, **profile**. Grant admin consent if a tenant account.
5. Create a client secret; put values in `server/.env` (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`).

The UI will automatically show "Continue with Google / Microsoft" buttons only when credentials are configured.

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

## Storage

Accounts, contacts, scan history and folder UID state are persisted to a JSON file (`server/data/xcontacts.json`) with an atomic-write backup (`.bak`). No database server, no native modules, no Visual Studio — works on any OS with Node 18+.

## Disclaimer

Use only on mailboxes you own or have explicit permission to access.
