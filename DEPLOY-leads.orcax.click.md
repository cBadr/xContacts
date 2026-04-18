# نشر xContacts على leads.orcax.click (Ubuntu)

## 1) متطلبات قبل التشغيل
- سيرفر Ubuntu 22.04/24.04 بصلاحيات `sudo`.
- DNS: سجل **A** يشير `leads.orcax.click` → IP السيرفر (تحقق: `dig +short leads.orcax.click`).
- المنافذ 22/80/443 مفتوحة (الجدار الناري عند المزوّد — السكريبت يتكفل بـ `ufw`).

## 2) ارفع الكود إلى السيرفر
اختر طريقة:

**أ) عبر git (الأسهل للتحديث):**
```bash
sudo mkdir -p /opt/xcontacts && sudo chown "$USER" /opt/xcontacts
git clone https://github.com/YOU/xcontacts.git /opt/xcontacts
```

**ب) عبر rsync من جهازك:**
```bash
rsync -avz --exclude node_modules --exclude client/dist \
  ./ user@SERVER:/opt/xcontacts/
```

## 3) شغّل سكريبت الإعداد
```bash
cd /opt/xcontacts
sudo bash scripts/ubuntu-setup.sh
```

السكريبت يقوم بـ:
1. تثبيت Node 20 + nginx + certbot + ufw.
2. إنشاء مستخدم نظام `xcontacts`.
3. نسخ `.env.production` → `.env` و`server/.env`.
4. `npm install` + بناء الواجهة.
5. تثبيت وتشغيل خدمة `systemd` (`xcontacts`).
6. ضبط nginx reverse-proxy على `leads.orcax.click`.
7. إصدار شهادة Let's Encrypt تلقائياً.

## 4) ضبط مفاتيح OAuth
عدّل `/opt/xcontacts/.env` وأضف:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
```
ثم زامن الـ mirror وأعد التشغيل:
```bash
sudo cp /opt/xcontacts/.env /opt/xcontacts/server/.env
sudo systemctl restart xcontacts
```

سجّل في Google Cloud و Azure Entra الـ redirect URI **بنفس الشكل تماماً**:
```
https://leads.orcax.click/api/oauth/callback
```

## 5) التحقق
```bash
curl https://leads.orcax.click/api/health
# → {"ok":true,"version":"1.0.0"}
```

## التحديث لاحقاً
```bash
cd /opt/xcontacts
sudo -u xcontacts git pull
sudo -u xcontacts node scripts/deploy.js --restart=none
sudo systemctl restart xcontacts
```

## تشخيص الأعطال
| عَرَض | الأمر |
|---|---|
| الخدمة لا تقوم | `sudo journalctl -u xcontacts -n 100 --no-pager` |
| nginx 502 | `sudo systemctl status xcontacts` + `curl 127.0.0.1:5174/api/health` |
| certbot فشل | تحقق DNS: `dig +short leads.orcax.click` ثم `sudo certbot --nginx -d leads.orcax.click` |
| OAuth `redirect_uri_mismatch` | الـ URI المسجّل يجب أن يطابق `https://leads.orcax.click/api/oauth/callback` بالحرف |
| Rate-limit يحجبك | تأكد `TRUST_PROXY=1` في `.env` |
