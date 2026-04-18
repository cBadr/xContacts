export async function getPresets() {
  const r = await fetch('/api/presets');
  if (!r.ok) throw new Error('Failed to load presets');
  return r.json();
}

export async function detectPreset(email) {
  const r = await fetch('/api/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  return r.json();
}

export async function testConnection(config) {
  const r = await fetch('/api/test', {
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
      const res = await fetch('/api/scan', {
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
  return `/api/export/${encodeURIComponent(token)}/${format}`;
}
