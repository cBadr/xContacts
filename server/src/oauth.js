import { randomBytes, createHash } from 'node:crypto';

const PROVIDERS = {
  google: {
    label: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly',
    userinfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    imap: {
      host: 'imap.gmail.com', port: 993, secure: true,
      sentMailbox: '[Gmail]/Sent Mail', inboxMailbox: 'INBOX'
    }
  },
  microsoft: {
    label: 'Microsoft',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'https://outlook.office.com/IMAP.AccessAsUser.All Contacts.Read offline_access openid email profile',
    userinfoUrl: 'https://graph.microsoft.com/v1.0/me',
    extraAuthParams: { prompt: 'select_account' },
    imap: {
      host: 'outlook.office365.com', port: 993, secure: true,
      sentMailbox: 'Sent Items', inboxMailbox: 'INBOX'
    }
  }
};

function base64url(buf) {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pkcePair() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

const pending = new Map();
const PENDING_TTL = 10 * 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > PENDING_TTL) pending.delete(k);
}, 60_000).unref();

export function listConfiguredProviders() {
  return Object.entries(PROVIDERS)
    .filter(([key]) => getCreds(key).clientId)
    .map(([key, p]) => ({ key, label: p.label }));
}

export function getProvider(key) {
  return PROVIDERS[key] || null;
}

function getCreds(provider) {
  if (provider === 'google') {
    return { clientId: process.env.GOOGLE_CLIENT_ID || '', clientSecret: process.env.GOOGLE_CLIENT_SECRET || '' };
  }
  if (provider === 'microsoft') {
    return { clientId: process.env.MICROSOFT_CLIENT_ID || '', clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '' };
  }
  return { clientId: '', clientSecret: '' };
}

export function buildAuthUrl(providerKey, redirectUri) {
  const provider = PROVIDERS[providerKey];
  if (!provider) throw new Error('Unknown provider');
  const { clientId } = getCreds(providerKey);
  if (!clientId) throw new Error(`${provider.label} OAuth is not configured on the server`);

  const state = base64url(randomBytes(16));
  const { verifier, challenge } = pkcePair();
  pending.set(state, { provider: providerKey, verifier, redirectUri, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: provider.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...provider.extraAuthParams
  });
  return { url: `${provider.authUrl}?${params.toString()}`, state };
}

export async function exchangeCode({ code, state, redirectUri }) {
  const ctx = pending.get(state);
  if (!ctx) throw new Error('Invalid or expired OAuth state');
  pending.delete(state);
  const provider = PROVIDERS[ctx.provider];
  const { clientId, clientSecret } = getCreds(ctx.provider);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri || ctx.redirectUri,
    client_id: clientId,
    code_verifier: ctx.verifier
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Token exchange failed (HTTP ${res.status})`);

  let email = '';
  try {
    const uRes = await fetch(provider.userinfoUrl, { headers: { Authorization: `Bearer ${data.access_token}` } });
    const u = await uRes.json();
    email = u.email || u.mail || u.userPrincipalName || '';
  } catch { /* noop */ }

  return {
    provider: ctx.provider,
    email,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000),
    imap: provider.imap
  };
}

export async function refreshAccessToken({ provider, refreshToken }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error('Unknown provider');
  const { clientId, clientSecret } = getCreds(provider);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || 'Token refresh failed');
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000)
  };
}
