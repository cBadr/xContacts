# Deployment Guide

## Architecture

xContacts has **two separate parts**:

- **Frontend** (`client/`) — static React build. Goes on Vercel/Netlify/any static host.
- **Backend** (`server/`) — long-lived Node process with SQLite, SSE streams, OAuth callbacks, IMAP sockets. **Does NOT run on Vercel serverless.** Needs a real host with persistent disk.

**You must deploy BOTH.** Vercel alone = empty providers list, broken scans.

---

## 🚀 Fastest path: Fly.io (free) + Vercel (free)

### Step 1 — Deploy backend to Fly.io

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
# Sign up (free): fly auth signup

cd server
fly launch --no-deploy --copy-config
# Accept the defaults. Choose a region close to you.

# Create persistent disk for SQLite
fly volume create xcontacts_data --size 1 --region <same-region-as-app>

# Set secrets (OAuth is optional — skip if you only use passwords)
fly secrets set \
  CORS_ORIGIN=https://YOUR-APP.vercel.app \
  OAUTH_REDIRECT_BASE=https://YOUR-APP-NAME.fly.dev \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  MICROSOFT_CLIENT_ID=... \
  MICROSOFT_CLIENT_SECRET=...

fly deploy
```

After deploy, your backend is live at `https://YOUR-APP-NAME.fly.dev`. Test it:
```
curl https://YOUR-APP-NAME.fly.dev/api/health
# → {"ok":true,"version":"1.0.0"}
```

### Step 2 — Deploy frontend to Vercel

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. In **Project Settings → Environment Variables**, add:
   ```
   VITE_API_URL=https://YOUR-APP-NAME.fly.dev
   ```
4. Edit [`vercel.json`](vercel.json) — replace `REPLACE-WITH-YOUR-BACKEND.example.com` with `YOUR-APP-NAME.fly.dev`.
5. Deploy.

### Step 3 — Update OAuth redirect URIs

- **Google Cloud Console** → Credentials → your OAuth client → add authorized redirect URI:
  `https://YOUR-APP-NAME.fly.dev/api/oauth/callback`
- **Azure/Entra** → App registration → Authentication → Web → Redirect URIs: same URL.

Now reload the Vercel site — the banner should disappear, and the providers list populates.

---

## Alternative 1 — Render.com

Free tier doesn't persist disks, so use their managed PostgreSQL (future option) or the paid Starter plan ($7/mo) for a persistent disk.

```yaml
# render.yaml
services:
  - type: web
    name: xcontacts-server
    runtime: node
    rootDir: server
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: XC_DATA_DIR
        value: /var/data
    disk:
      name: xcontacts-data
      mountPath: /var/data
      sizeGB: 1
```

## Alternative 2 — Docker on any VPS (Hetzner, DO, Linode)

```bash
# On any $4/month VPS:
git clone https://github.com/YOU/xcontacts.git
cd xcontacts/server
cp .env.example .env   # edit with your values
docker build -t xcontacts-server .
docker run -d --name xcontacts \
  -p 5174:5174 \
  -v xcontacts-data:/data \
  --env-file .env \
  --restart unless-stopped \
  xcontacts-server
```

Put nginx/Caddy in front for TLS. Point your `VITE_API_URL` at the public URL.

## Alternative 3 — Windows Server (now dependency-free!)

**Version 1.1 removed the native SQLite dependency** — the server now uses a pure-JS JSON store. No Visual Studio, no Python, no node-gyp. Any LTS Node works (18, 20, 22, 24).

```powershell
# 1. Install Node LTS from https://nodejs.org (any recent version)
# 2. Clone/download the repo:
git clone https://github.com/YOU/xcontacts.git
cd xcontacts\server

# 3. One-click install + start:
run.bat

# OR manually:
npm install
copy .env.example .env
notepad .env
node src\index.js
```

**Run as a Windows service** with PM2:

```powershell
npm install -g pm2 pm2-windows-startup
pm2-startup install
cd xcontacts\server
pm2 start ecosystem.config.cjs
pm2 save
```

Logs land in `server/logs/`. Data in `server/data/xcontacts.json` (+ `.bak`).

Put IIS/nginx/Caddy in front for TLS + reverse proxy.

---

## Troubleshooting

### "Providers list is empty" on Vercel
- The frontend can't reach the backend. Check the orange banner in the UI.
- Verify `VITE_API_URL` is set in Vercel (must start with `https://`).
- Rebuild/redeploy Vercel after changing env vars — Vite bakes them at build time.

### "CORS error" in browser console
- Set `CORS_ORIGIN=https://your-app.vercel.app` on the backend and restart it.

### "OAuth popup says redirect_uri mismatch"
- The URI registered in Google/Azure must match `OAUTH_REDIRECT_BASE + /api/oauth/callback` exactly (no trailing slash, same scheme).

### Original Vercel build error `sh: line 1: vite: command not found`
Fixed already:
- Root `build` script now installs client deps first.
- The circular `"xcontacts": "file:.."` dependency was removed.

### Old note: `better-sqlite3` build errors on Windows
No longer applicable — the server dropped the native SQLite module in v1.1 and uses a pure-JS JSON store. If you upgraded from an older version, just `rm -rf server/node_modules` and `npm install` again. Your existing `data/xcontacts.db` file will be ignored (data is now `data/xcontacts.json`).

---

## Local development

```bash
cd xcontacts
npm run install:all
npm run dev        # both server + client
# OR
npm run dev:server # server only
npm run dev:client # client only (in a second terminal)
```
