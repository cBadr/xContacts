# Deployment Guide

xContacts has two parts:

- **Frontend** (`client/`) — static React/Vite build. Fine for Vercel/Netlify/Cloudflare Pages.
- **Backend** (`server/`) — long-lived Node.js process with SQLite, SSE streams, and OAuth callbacks. **Cannot run on Vercel serverless** (no persistent disk, SSE/streams are cut, IMAP holds open TCP sockets). It needs a real host: VPS, Windows Server, Railway, Render, Fly.io, Docker.

## 1. Deploy the Backend first

The frontend needs a public URL to call, so deploy the backend first and note its URL.

### Option A — Windows Server (what you tried)

```powershell
# 1. Install Node.js 20 LTS from https://nodejs.org
# 2. Install build tools for better-sqlite3 (needed because sqlite compiles natively):
npm install --global --production windows-build-tools
# Or install "Desktop development with C++" from Visual Studio Build Tools + Python 3

# 3. Clone and install
git clone https://github.com/YOU/xcontacts.git
cd xcontacts\server
npm install

# 4. Configure environment
copy .env.example .env
# Edit .env to set OAUTH_REDIRECT_BASE=https://api.yourdomain.com and OAuth credentials

# 5. Run
npm start
```

**Run as a Windows service** with PM2:

```powershell
npm install -g pm2 pm2-windows-startup
pm2-startup install
cd xcontacts\server
pm2 start ecosystem.config.cjs
pm2 save
```

PM2 will auto-start the server on reboot. Logs live in `server/logs/`.

**Firewall:** allow inbound TCP on the port in `.env` (default 5174), and put it behind IIS/nginx/Caddy for TLS.

### Option B — Docker (recommended)

```bash
cd xcontacts/server
docker build -t xcontacts-server .
docker run -d --name xcontacts \
  -p 5174:5174 \
  -v xcontacts-data:/data \
  --env-file .env \
  --restart unless-stopped \
  xcontacts-server
```

The `/data` volume persists the SQLite database across restarts.

### Option C — Railway / Render / Fly.io

- Create a new Node service from the GitHub repo.
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Add a persistent disk mounted at `/data` and set `XC_DATA_DIR=/data`.
- Set all env vars from `server/.env.example`.

## 2. Deploy the Frontend to Vercel

1. Import the GitHub repo in Vercel.
2. **Framework Preset:** None (use the included `vercel.json`).
3. **Root directory:** keep as repo root — `vercel.json` handles it.
4. **Environment variable:** set `VITE_API_URL` to your backend's public URL, e.g. `https://xcontacts-api.yourdomain.com`.
5. **Edit `vercel.json`** — replace `REPLACE-WITH-YOUR-BACKEND.example.com` with the same URL (this enables the `/api/*` rewrite so the same-origin cookies/CORS are simpler).
6. Deploy.

After deploy, go back to your backend's `.env` and:

- Set `CORS_ORIGIN=https://your-vercel-app.vercel.app`
- Set `OAUTH_REDIRECT_BASE=https://your-vercel-app.vercel.app` (must match what you register in Google/Microsoft consoles)
- Update the **Authorized redirect URI** in Google Cloud + Azure to `https://your-vercel-app.vercel.app/api/oauth/callback`

Restart the backend and the OAuth flow will work end-to-end.

## Why the original Vercel build failed

Your error was:

```
sh: line 1: vite: command not found
Error: Command "npm run build" exited with 127
```

Two causes:

1. **Root `package.json` didn't install client deps** before building. Fixed: the new `build` script does `npm --prefix client install --include=dev && npm --prefix client run build`.
2. **A circular `"xcontacts": "file:.."` dependency** was inserted in `client/package.json` and `server/package.json`. That made `npm install` loop. Removed.

## Local development (Windows-friendly)

```powershell
cd xcontacts
npm run install:all

# Start server only (uses Node's built-in --watch, no nodemon/concurrently needed)
npm run dev:server

# In another terminal
npm run dev:client
```

Or both at once with `npm run dev` (requires `concurrently`, which now works on Windows because we only use `--prefix` flags).

If `better-sqlite3` fails to install on Windows because node-gyp can't find a compiler, install the Visual Studio Build Tools + Python 3 once, then re-run `npm install` inside `server/`. Prebuilt binaries exist for Node 18/20/22 x64, so this usually isn't needed.
