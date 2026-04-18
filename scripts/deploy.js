#!/usr/bin/env node
// Cross-platform one-shot deploy script. Usable on Linux, macOS and Windows.
//   node scripts/deploy.js [--no-pull] [--no-install] [--no-build] [--restart=pm2|systemd|none]

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = new Set(process.argv.slice(2));
const restartArg = [...args].find(a => a.startsWith('--restart='))?.split('=')[1] || 'auto';

function run(cmd, argv, opts = {}) {
  const display = [cmd, ...argv].join(' ');
  console.log(`\n[xcontacts] $ ${display}`);
  const res = spawnSync(cmd, argv, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32', ...opts });
  if (res.status !== 0) {
    console.error(`[xcontacts] command failed (${res.status}): ${display}`);
    process.exit(res.status || 1);
  }
}

function step(label, fn) {
  console.log(`\n==> ${label}`);
  fn();
}

// 1. pull
if (!args.has('--no-pull') && existsSync(path.join(ROOT, '.git'))) {
  step('Pulling latest from git', () => run('git', ['pull', '--ff-only']));
} else {
  console.log('==> Skipping git pull');
}

// 2. install
if (!args.has('--no-install')) {
  step('Installing server dependencies', () =>
    run('npm', ['--prefix', 'server', 'install', '--omit=dev', '--no-audit', '--no-fund']));
  step('Installing client build dependencies', () =>
    run('npm', ['--prefix', 'client', 'install', '--include=dev', '--no-audit', '--no-fund']));
}

// 3. build
if (!args.has('--no-build')) {
  step('Building client', () => run('npm', ['--prefix', 'client', 'run', 'build']));
}

// 4. restart
const which = cmd => {
  const res = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return res.status === 0;
};

if (restartArg !== 'none') {
  const pick = restartArg === 'auto'
    ? (which('pm2') ? 'pm2' : which('systemctl') ? 'systemd' : 'manual')
    : restartArg;

  if (pick === 'pm2') {
    step('Restarting via PM2', () => {
      const r = spawnSync('pm2', ['restart', 'xcontacts-server'], { stdio: 'inherit', shell: true, cwd: ROOT });
      if (r.status !== 0) run('pm2', ['start', 'server/ecosystem.config.cjs']);
    });
  } else if (pick === 'systemd') {
    step('Restarting via systemd', () => run('sudo', ['systemctl', 'restart', 'xcontacts']));
  } else {
    console.log('\n==> No process manager detected. Start manually: node server/src/index.js');
  }
}

console.log('\n✓ Deploy complete.');
