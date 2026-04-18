import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { IMAP_PRESETS, detectPreset } from './presets.js';
import { extractContacts, testConnection, toCSV, toVCF } from './extractor.js';

const app = express();
const PORT = Number(process.env.PORT) || 5174;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const MAX_FETCH = Number(process.env.MAX_FETCH_PER_FOLDER) || 5000;

app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 30 }));

const sessions = new Map(); // token -> { contacts, createdAt }
const SESSION_TTL = 30 * 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (now - v.createdAt > SESSION_TTL) sessions.delete(k);
}, 60_000).unref();

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '1.0.0' }));

app.get('/api/presets', (_req, res) => {
  res.json(Object.entries(IMAP_PRESETS).map(([k, v]) => ({ key: k, ...v })));
});

app.post('/api/detect', (req, res) => {
  const email = String(req.body?.email || '');
  const key = detectPreset(email);
  res.json({ preset: key, config: key ? IMAP_PRESETS[key] : null });
});

const scanSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(true),
  user: z.string().email(),
  pass: z.string().min(1),
  scan: z.enum(['inbox', 'sent', 'both']).default('both'),
  inboxMailbox: z.string().default('INBOX'),
  sentMailbox: z.string().default('Sent'),
  since: z.string().nullable().optional(),
  before: z.string().nullable().optional(),
  maxPerFolder: z.number().int().min(10).max(MAX_FETCH).default(1000),
  filters: z.object({
    excludeDomains: z.array(z.string()).default([]),
    excludeNoReply: z.boolean().default(true),
    requireName: z.boolean().default(false)
  }).default({})
});

const testSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(true),
  user: z.string().email(),
  pass: z.string().min(1)
});

app.post('/api/test', async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'Invalid input' });
  const result = await testConnection(parsed.data);
  res.json(result);
});

app.post('/api/scan', async (req, res) => {
  const parsed = scanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);

  try {
    const contacts = await extractContacts(parsed.data, send);
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessions.set(token, { contacts, createdAt: Date.now() });
    send({ type: 'result', token, contacts });
  } catch (err) {
    send({ type: 'error', message: err?.message || 'Scan failed' });
  } finally {
    clearInterval(ping);
    res.end();
  }
});

app.get('/api/export/:token/:format', (req, res) => {
  const { token, format } = req.params;
  const sess = sessions.get(token);
  if (!sess) return res.status(404).json({ error: 'Session expired' });
  const { contacts } = sess;
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="xcontacts-${stamp}.csv"`);
    return res.send('\uFEFF' + toCSV(contacts));
  }
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="xcontacts-${stamp}.json"`);
    return res.send(JSON.stringify(contacts, null, 2));
  }
  if (format === 'vcf') {
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="xcontacts-${stamp}.vcf"`);
    return res.send(toVCF(contacts));
  }
  res.status(400).json({ error: 'Unknown format' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || 'Internal error' });
});

process.on('uncaughtException', err => {
  console.error('[uncaughtException]', err?.message || err);
});
process.on('unhandledRejection', err => {
  console.error('[unhandledRejection]', err?.message || err);
});

app.listen(PORT, () => {
  console.log(`xContacts server listening on http://localhost:${PORT}`);
});
