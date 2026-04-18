#!/usr/bin/env bash
# ============================================================
# xContacts — نشر كامل على Ubuntu للدومين leads.orcax.click
# شغّل هذا السكريبت بصلاحيات sudo على سيرفر Ubuntu نظيف:
#   sudo bash scripts/ubuntu-setup.sh
# أو نزّل المستودع أولاً في /opt/xcontacts ثم شغّل السكريبت.
# ============================================================
set -euo pipefail

DOMAIN="leads.orcax.click"
APP_DIR="/opt/xcontacts"
APP_USER="xcontacts"
NODE_MAJOR="20"
# غيّر هذا إن رفعت الكود يدوياً (rsync/scp) بدل git clone
REPO_URL="${REPO_URL:-}"

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
fail() { echo -e "\033[1;31m✗\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "شغّل السكريبت بـ sudo"

# ---------- 1. حزم النظام ----------
log "تحديث النظام + تثبيت الأدوات الأساسية"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates git ufw nginx certbot python3-certbot-nginx

# ---------- 2. Node.js 20 ----------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v${NODE_MAJOR}* ]]; then
  log "تثبيت Node.js ${NODE_MAJOR} LTS"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v && npm -v

# ---------- 3. مستخدم التطبيق ----------
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "إنشاء مستخدم النظام $APP_USER"
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

# ---------- 4. جلب الكود ----------
if [[ ! -d "$APP_DIR/.git" && ! -f "$APP_DIR/package.json" ]]; then
  if [[ -n "$REPO_URL" ]]; then
    log "استنساخ المستودع من $REPO_URL"
    git clone "$REPO_URL" "$APP_DIR"
  else
    fail "الدليل $APP_DIR فارغ. ارفع الكود إليه أولاً أو عرّف REPO_URL."
  fi
fi
mkdir -p "$APP_DIR/server/data" "$APP_DIR/server/logs"

# ---------- 5. ملف .env ----------
if [[ ! -f "$APP_DIR/.env" ]]; then
  log "إنشاء .env من .env.production"
  cp "$APP_DIR/.env.production" "$APP_DIR/.env"
  echo "⚠️  عدّل $APP_DIR/.env لإضافة مفاتيح OAuth ثم أعد تشغيل الخدمة"
fi
# نسخة مرآة داخل /server حتى يراها الـ server loader
cp -f "$APP_DIR/.env" "$APP_DIR/server/.env"

# ---------- 6. تثبيت + بناء ----------
log "تثبيت الحزم وبناء الواجهة"
cd "$APP_DIR"
npm --prefix server install --omit=dev --no-audit --no-fund
npm --prefix client install --include=dev --no-audit --no-fund
npm --prefix client run build

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---------- 7. systemd ----------
log "تثبيت خدمة systemd"
# نضبط الخدمة لتعمل تحت المستخدم xcontacts بدل www-data
install -m 644 "$APP_DIR/xcontacts.service" /etc/systemd/system/xcontacts.service
sed -i "s|^User=.*|User=${APP_USER}|"  /etc/systemd/system/xcontacts.service
sed -i "s|^Group=.*|Group=${APP_USER}|" /etc/systemd/system/xcontacts.service
systemctl daemon-reload
systemctl enable --now xcontacts
sleep 2
systemctl --no-pager --lines=20 status xcontacts || true

# فحص صحة
curl -fsS http://127.0.0.1:5174/api/health && echo \
  || fail "الخادم لا يستجيب على 127.0.0.1:5174 — راجع: journalctl -u xcontacts -n 80"

# ---------- 8. الجدار الناري ----------
log "فتح المنافذ 22/80/443"
ufw allow 22/tcp  >/dev/null || true
ufw allow 80/tcp  >/dev/null || true
ufw allow 443/tcp >/dev/null || true
yes | ufw enable  >/dev/null || true

# ---------- 9. nginx + TLS ----------
log "إعداد nginx لـ $DOMAIN"
# تكوين HTTP فقط أولاً حتى يمرّ تحدي Let's Encrypt
cat >/etc/nginx/sites-available/xcontacts <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / {
        proxy_pass http://127.0.0.1:5174;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/xcontacts /etc/nginx/sites-enabled/xcontacts
rm -f /etc/nginx/sites-enabled/default
mkdir -p /var/www/html
nginx -t
systemctl reload nginx

log "إصدار شهادة Let's Encrypt لـ $DOMAIN"
if ! certbot --nginx -d "$DOMAIN" \
      --non-interactive --agree-tos --redirect \
      -m "admin@${DOMAIN#*.}" ; then
  echo "⚠️  فشل certbot. تأكد أن DNS للدومين ${DOMAIN} يشير إلى هذا السيرفر ثم أعد: certbot --nginx -d ${DOMAIN}"
fi

# ---------- 10. خلاصة ----------
cat <<DONE

✓ تم النشر.
   الدومين:  https://${DOMAIN}
   الفحص:   curl https://${DOMAIN}/api/health

الخطوات المتبقية (يدوياً):
  1) عدّل مفاتيح OAuth في:  $APP_DIR/.env
     - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
     - MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET
  2) في Google Cloud و Azure سجّل الـ redirect URI التالي **تماماً**:
        https://${DOMAIN}/api/oauth/callback
  3) أعد تشغيل الخدمة:  sudo systemctl restart xcontacts
  4) لمتابعة اللوج:     sudo journalctl -u xcontacts -f

لتحديث النشر لاحقاً:
    cd $APP_DIR && sudo -u $APP_USER git pull && \\
    sudo -u $APP_USER node scripts/deploy.js --restart=none && \\
    sudo systemctl restart xcontacts
DONE
