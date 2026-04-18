const BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/+$/, '');
const url = p => `${BASE}${p}`;

export async function getPresets() {
  const r = await fetch(url('/api/presets'));
  if (!r.ok) throw new Error('Failed to load presets');
  return r.json();
}

export async function detectPreset(email) {
  const r = await fetch(url('/api/detect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  return r.json();
}

export async function getOAuthProviders() {
  const r = await fetch(url('/api/oauth/providers'));
  if (!r.ok) return [];
  return r.json();
}

export function startOAuth(provider) {
  return new Promise(async (resolve, reject) => {
    try {
      const r = await fetch(url(`/api/oauth/${provider}/start`));
      const data = await r.json();
      if (!r.ok) return reject(new Error(data.error || 'Failed to start OAuth'));

      const w = 500, h = 650;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(data.url, 'xcontacts-oauth', `width=${w},height=${h},left=${left},top=${top}`);
      if (!popup) return reject(new Error('Popup blocked. Please allow popups for this site.'));

      const onMessage = ev => {
        const msg = ev.data;
        if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('xcontacts-oauth:')) return;
        window.removeEventListener('message', onMessage);
        clearInterval(poll);
        if (msg.type === 'xcontacts-oauth:success') resolve(msg);
        else reject(new Error(msg.error || 'OAuth failed'));
      };
      window.addEventListener('message', onMessage);

      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          window.removeEventListener('message', onMessage);
          reject(new Error('Sign-in window was closed before completing'));
        }
      }, 500);
    } catch (e) { reject(e); }
  });
}

export async function getOAuthToken(session) {
  const r = await fetch(url(`/api/oauth/token/${encodeURIComponent(session)}`), { method: 'POST' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Failed to get token');
  return data;
}

export async function revokeOAuth(session) {
  try { await fetch(url(`/api/oauth/revoke/${encodeURIComponent(session)}`), { method: 'POST' }); } catch { /* noop */ }
}

export async function testConnection(config) {
  const r = await fetch(url('/api/test'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  return r.json();
}

export function scanStream(config, handlers) {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(url('/api/scan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        signal: controller.signal
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        handlers.onEvent?.({ type: 'error', message: err.error || `HTTP ${res.status}` });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              try { handlers.onEvent?.(JSON.parse(line.slice(6))); } catch { /* ignore */ }
            }
          }
        }
      }
      handlers.onDone?.();
    } catch (e) {
      if (e.name !== 'AbortError') handlers.onEvent?.({ type: 'error', message: e.message });
    }
  })();
  return () => controller.abort();
}

export function exportUrl(token, format) {
  return url(`/api/export/${encodeURIComponent(token)}/${format}`);
}

export function accountExportUrl(accountId, format) {
  return url(`/api/accounts/${accountId}/export/${format}`);
}

export function exportAllUrl(format) {
  return url(`/api/export-all/${format}`);
}

export async function listAccounts() {
  const r = await fetch(url('/api/accounts'));
  return r.ok ? r.json() : [];
}

export async function getAccount(id) {
  const r = await fetch(url(`/api/accounts/${id}`));
  if (!r.ok) throw new Error('Failed to load account');
  return r.json();
}

export async function deleteAccount(id) {
  const r = await fetch(url(`/api/accounts/${id}`), { method: 'DELETE' });
  return r.ok;
}

export async function resetAccount(id) {
  const r = await fetch(url(`/api/accounts/${id}/reset`), { method: 'POST' });
  return r.ok;
}
