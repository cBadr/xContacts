# Deployment Guide

xContacts ships as a **single-origin** app: the Node server serves the built React UI *and* the `/api/*` routes from the **same port and domain**. No separate frontend hosting needed.

```
Browser  →  https://xcontacts.example.com  →  Caddy/nginx :443  →  Node :5174
                                                                     ├─ serves /            → client/dist
                                                                     └─ serves /api/*       → Express
```

---

## Option A — Docker (recommended)

One container, one command.

```bash
git clone https://github.com/YOU/xcontacts.git
cd xcontacts
cp .env.example .env
nano .env          # set PUBLIC_URL, OAuth keys…

docker compose up -d --build
```

Check it: `curl http://YOUR-IP:5174/api/health` → `{"ok":true}`.

Browse to `http://YOUR-IP:5174`. The React UI loads, the API works, everything talks same-origin.

### Add HTTPS automatically (Caddy)

Uncomment the `caddy:` block in [docker-compose.yml](docker-compose.yml), edit [Caddyfile](Caddyfile) with your real domain, point DNS at the server, then:

```bash
docker compose up -d
```

Caddy fetches a Let's Encrypt cert automatically. Done. Remember to update `PUBLIC_URL` to `https://your-domain.com` and re-register the redirect URI in Google/Azure.

---

## Option B — Bare Linux VPS (systemd)

```bash
# 1. Install Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# 2. Clone + build
sudo mkdir -p /opt/xcontacts && sudo chown $USER /opt/xcontacts
git clone https://github.com/YOU/xcontacts.git /opt/xcontacts
cd /opt/xcontacts
cp .env.example .env
nano .env          # PUBLIC_URL, OAuth keys, PORT

npm run install:all
npm run build

# 3. Install as a systemd service
sudo cp xcontacts.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now xcontacts

# 4. Put nginx in front for HTTPS (edit server_name first)
sudo cp nginx.conf.example /etc/nginx/sites-available/xcontacts
sudo ln -s /etc/nginx/sites-available/xcontacts /etc/nginx/sites-enabled/
sudo certbot --nginx -d xcontacts.example.com
sudo systemctl reload nginx
```

To update later:
```bash
cd /opt/xcontacts && node scripts/deploy.js
```

---

## Option C — Windows Server

```powershell
# 1. Install Node 20 LTS from https://nodejs.org
# 2. Clone + configure
git clone https://github.com/YOU/xcontacts.git C:\xcontacts
cd C:\xcontacts
copy .env.example .env
notepad .env

# 3. Install + build
npm run install:all
npm run build

# 4. Install PM2 as a Windows service
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start server\ecosystem.config.cjs
pm2 save

# 5. Redeploy on update
deploy.bat
```

Open Windows Firewall for the chosen port (default 5174), or put IIS/Caddy in front for TLS.

---

## Option D — Bare IP, no domain (testing)

If you just want it running on `http://203.0.113.10:5174`:

```bash
# .env
PUBLIC_URL=http://203.0.113.10:5174
PORT=5174
HOST=0.0.0.0
```

Then `npm run preview` (or any option above). OAuth will still work **only** if you register `http://203.0.113.10:5174/api/oauth/callback` in Google/Azure — some providers refuse non-HTTPS except for `localhost`. Use HTTPS for real deployments.

---

## Required environment variables

| Key | Purpose |
|-----|---------|
| `PUBLIC_URL` | External URL browsers hit. Drives OAuth redirect and CORS. |
| `PORT`, `HOST` | Where Node binds. Default `5174` / `0.0.0.0`. |
| `NODE_ENV=production` | Enables caching, disables dev logging. |
| `TRUST_PROXY=1` | Required when behind Caddy/nginx/Cloudflare so rate-limit sees real IPs. |
| `XC_DATA_DIR` | Where the JSON store lives. Use a persistent path. |
| `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET` | OAuth keys (optional — only needed if you want 1-click sign-in). |

---

## OAuth redirect URIs — must register exactly

- Google Cloud Console → Credentials → Your OAuth client → **Authorized redirect URIs**:
  `https://xcontacts.example.com/api/oauth/callback`
- Azure/Entra → App registration → Authentication → Web → **Redirect URIs**: same URL.

Any mismatch (http vs https, trailing slash, wrong port) → `redirect_uri_mismatch` error.

---

## Verifying it works

```bash
# Health check
curl https://xcontacts.example.com/api/health
# → {"ok":true,"version":"1.0.0"}

# UI loads
curl -I https://xcontacts.example.com
# → HTTP/2 200, content-type: text/html
```

Browse the URL — you should see the full xContacts UI, the orange backend banner should NOT appear, the providers list should populate if OAuth keys are set.

---

## Updating after deploy

| Scenario | Command |
|---|---|
| Docker compose | `git pull && docker compose up -d --build` |
| Linux + systemd | `node scripts/deploy.js` |
| Windows + PM2 | `deploy.bat` |
| Any | Manually: `git pull && npm run install:all && npm run build && restart-service` |

---

## Troubleshooting

- **`EACCES` on port 80/443** → bind to 5174 and let Caddy/nginx handle 80/443.
- **OAuth popup shows `redirect_uri_mismatch`** → URI in provider console ≠ `PUBLIC_URL + /api/oauth/callback`.
- **Rate-limit blocks you from your own IP** → behind a proxy without `TRUST_PROXY=1`, every request looks like `127.0.0.1` until you set the flag.
- **SSE scan stalls / no progress events** → nginx must have `proxy_buffering off;` (already in the provided example).
- **Data disappears after docker restart** → you skipped the `xcontacts_data` volume. Never rely on container FS.
