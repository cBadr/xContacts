#!/usr/bin/env node
import { promises as dns } from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import readline from 'node:readline';
import { ImapFlow } from 'imapflow';
import { IMAP_PRESETS, detectPreset } from './presets.js';

const C = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m'
};
const ok = m => console.log(`${C.green}✓${C.reset} ${m}`);
const fail = m => console.log(`${C.red}✗${C.reset} ${m}`);
const info = m => console.log(`${C.cyan}ℹ${C.reset} ${m}`);
const step = m => console.log(`\n${C.bold}${C.blue}▸ ${m}${C.reset}`);

function ask(rl, q) {
  return new Promise(resolve => rl.question(q, resolve));
}

function askHidden(q) {
  return new Promise(resolve => {
    process.stdout.write(q);
    let buf = '';
    const onData = chunk => {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.removeListener('data', onData);
          if (process.stdin.isTTY) process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          return resolve(buf);
        }
        if (ch === '\u0003') process.exit(1);
        if (ch === '\u007f' || ch === '\b') { if (buf.length) { buf = buf.slice(0, -1); process.stdout.write('\b \b'); } }
        else { buf += ch; process.stdout.write('*'); }
      }
    };
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function resolveDNS(host) {
  step(`DNS lookup: ${host}`);
  try {
    const addrs = await dns.lookup(host, { all: true });
    for (const a of addrs) ok(`${host} → ${a.address} (IPv${a.family})`);
    return addrs;
  } catch (e) {
    fail(`DNS failed: ${e.code || ''} ${e.message}`);
    return null;
  }
}

function tcpProbe(host, port) {
  return new Promise(resolve => {
    step(`TCP connect: ${host}:${port}`);
    const socket = net.createConnection({ host, port, timeout: 10_000 });
    const t0 = Date.now();
    socket.once('connect', () => {
      ok(`TCP connected in ${Date.now() - t0} ms`);
      socket.end();
      resolve(true);
    });
    socket.once('timeout', () => {
      fail('TCP timeout after 10s — port is blocked by firewall/ISP or host unreachable');
      socket.destroy();
      resolve(false);
    });
    socket.once('error', e => {
      fail(`TCP error: ${e.code || ''} ${e.message}`);
      resolve(false);
    });
  });
}

function tlsProbe(host, port) {
  return new Promise(resolve => {
    step(`TLS handshake: ${host}:${port}`);
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 10_000 }, () => {
      const cert = sock.getPeerCertificate();
      ok(`TLS ${sock.getProtocol()} · cipher: ${sock.getCipher()?.name}`);
      if (cert?.subject) info(`Certificate CN: ${cert.subject.CN || '?'}, issuer: ${cert.issuer?.CN || '?'}`);
      if (cert?.valid_to) info(`Valid until: ${cert.valid_to}`);
      if (!sock.authorized) info(`${C.yellow}Certificate not authorized: ${sock.authorizationError}${C.reset}`);
      let greeting = '';
      sock.on('data', chunk => {
        greeting += chunk.toString();
        if (greeting.includes('\r\n')) {
          ok(`Server greeting: ${greeting.trim().split('\r\n')[0]}`);
          sock.end();
        }
      });
      setTimeout(() => { if (!greeting) info('No greeting received within 3s'); sock.end(); }, 3000);
    });
    sock.once('timeout', () => { fail('TLS timeout'); sock.destroy(); resolve(false); });
    sock.once('error', e => { fail(`TLS error: ${e.code || ''} ${e.message}`); resolve(false); });
    sock.once('close', () => resolve(true));
  });
}

function rawImapLogin(host, port, user, pass) {
  return new Promise(resolve => {
    step(`Raw IMAP LOGIN probe: ${host}:${port}`);
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 15_000 });
    let buffer = '';
    let phase = 'greeting';
    const send = line => {
      console.log(`${C.dim}C: ${line.replace(pass, '***').replace(/\r\n$/, '')}${C.reset}`);
      sock.write(line);
    };
    const printServer = text => {
      for (const ln of text.split(/\r\n/).filter(Boolean)) console.log(`${C.dim}S: ${ln}${C.reset}`);
    };
    const finish = verdict => { try { sock.end(); } catch {} resolve(verdict); };

    sock.once('error', e => { fail(`Socket error: ${e.code || ''} ${e.message}`); resolve(false); });
    sock.once('timeout', () => { fail('Socket timeout'); sock.destroy(); resolve(false); });

    sock.on('data', chunk => {
      const piece = chunk.toString('utf8');
      buffer += piece;
      printServer(piece);

      if (phase === 'greeting' && /^\* OK/m.test(buffer)) {
        phase = 'capability';
        buffer = '';
        send('a1 CAPABILITY\r\n');
        return;
      }
      if (phase === 'capability' && /^a1 OK/m.test(buffer)) {
        phase = 'login';
        buffer = '';
        const esc = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        send(`a2 LOGIN ${esc(user)} ${esc(pass)}\r\n`);
        return;
      }
      if (phase === 'login') {
        const m = buffer.match(/^a2 (OK|NO|BAD)([^\r\n]*)/m);
        if (m) {
          const [, status, rest] = m;
          if (status === 'OK') { ok(`LOGIN succeeded${rest ? ' —' + rest : ''}`); send('a3 LOGOUT\r\n'); finish(true); }
          else { fail(`LOGIN ${status}${rest ? ' —' + rest : ''}`); finish(false); }
        }
      }
    });
  });
}

async function imapFlow(host, port, secure, user, pass) {
  step(`IMAP login: ${user}@${host}`);
  const client = new ImapFlow({
    host, port, secure,
    auth: { user, pass, loginMethod: 'LOGIN' },
    logger: {
      debug() {}, info() {},
      warn(obj) { if (obj?.msg) info(`imapflow warn: ${obj.msg}`); },
      error(obj) {
        const parts = [obj?.msg, obj?.err?.response, obj?.err?.responseText, obj?.err?.authenticationFailed && '(authenticationFailed)'].filter(Boolean);
        fail(`imapflow: ${parts.join(' · ')}`);
      }
    },
    socketTimeout: 60_000,
    greetingTimeout: 15_000,
    connectionTimeout: 15_000,
    tls: { rejectUnauthorized: false }
  });
  client.on('error', e => fail(`Async IMAP error: ${e.code || ''} ${e.message}`));
  try {
    await client.connect();
    ok(`Connected · authenticated: ${client.authenticated}`);
    info(`Server: ${client.serverInfo?.name || '?'} ${client.serverInfo?.version || ''}`);
    const caps = [...(client.serverInfo?.capabilities || [])];
    if (caps.length) info(`Capabilities: ${caps.slice(0, 12).join(', ')}${caps.length > 12 ? '…' : ''}`);

    step('LIST mailboxes');
    try {
      const list = await client.list();
      ok(`${list.length} mailboxes:`);
      for (const m of list) {
        const flags = [...(m.flags || [])].join(',');
        const su = m.specialUse ? ` ${C.yellow}${m.specialUse}${C.reset}` : '';
        console.log(`  ${C.dim}·${C.reset} ${m.path}${su}${flags ? ` ${C.dim}(${flags})${C.reset}` : ''}`);
      }
    } catch (e) {
      fail(`LIST failed: ${e.message}`);
    }

    step('STATUS INBOX');
    try {
      const s = await client.status('INBOX', { messages: true, recent: true, unseen: true });
      ok(`INBOX → messages: ${s.messages}, recent: ${s.recent}, unseen: ${s.unseen}`);
    } catch (e) {
      fail(`STATUS failed: ${e.message}`);
    }

    await client.logout();
    ok('Logout clean');
    return true;
  } catch (e) {
    fail(`IMAP failed: ${e.code || ''} ${e.message}`);
    if (e.authenticationFailed) {
      info('→ Authentication rejected. Common causes:');
      info('  • Gmail/Yahoo: you must use an App Password, not your normal password.');
      info('  • Outlook/Office365: basic-auth IMAP may be disabled by your tenant.');
      info('  • Comcast: "Third-Party Access Security" must be ENABLED on xfinity.com.');
      info('  • Windstream: some accounts migrated to Yahoo — try imap.mail.yahoo.com.');
    }
    try { client.close(); } catch { /* noop */ }
    return false;
  }
}

async function main() {
  console.log(`${C.bold}${C.blue}xContacts connection diagnostic${C.reset}`);
  console.log(`${C.dim}Runs a full DNS → TCP → TLS → IMAP → LIST sequence with detailed output.${C.reset}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (await ask(rl, 'Email: ')).trim();
  const presetKey = detectPreset(email);
  let host, port, secure;
  if (presetKey) {
    const p = IMAP_PRESETS[presetKey];
    info(`Detected preset: ${p.label} (${p.host}:${p.port})`);
    const override = (await ask(rl, `Press Enter to accept, or type custom host: `)).trim();
    host = override || p.host;
    port = p.port; secure = p.secure;
  } else {
    host = (await ask(rl, 'IMAP host: ')).trim();
    port = Number((await ask(rl, 'Port [993]: ')).trim() || 993);
    secure = (await ask(rl, 'TLS? (Y/n): ')).trim().toLowerCase() !== 'n';
  }
  rl.close();
  const pass = await askHidden('Password (hidden): ');

  console.log();
  const dnsOK = await resolveDNS(host);
  if (!dnsOK) { console.log(`\n${C.red}${C.bold}Stopped at DNS.${C.reset}`); return; }
  const tcpOK = await tcpProbe(host, port);
  if (!tcpOK) { console.log(`\n${C.red}${C.bold}Stopped at TCP — port ${port} unreachable.${C.reset}`); return; }
  if (secure) await tlsProbe(host, port);
  const rawOK = await rawImapLogin(host, port, email, pass);
  if (!rawOK) {
    console.log(`\n${C.yellow}Raw LOGIN was rejected by the server — the password (or account policy) is the blocker, not the code.${C.reset}`);
  }
  await imapFlow(host, port, secure, email, pass);

  console.log(`\n${C.bold}Diagnostic complete.${C.reset}`);
}

main().catch(e => { console.error(e); process.exit(1); });
