// Sets up the Convex backend of a self-hosted BazarPro instance.
// Runs in the convex-init container (docker-compose.selfhost.yml):
//
//   node scripts/selfhost/init.mjs                 deploy functions and set environment variables
//   node scripts/selfhost/init.mjs admin <email>   make an existing account an administrator
//   node scripts/selfhost/init.mjs seed            load the demo data (for trying BazarPro out)
//
// Safe to run on every start: functions are redeployed, JWT keys are only
// generated once and optional settings are only written when they are set.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

/** Passed through to Convex when set (see ENV.md) */
const OPTIONAL_SETTINGS = [
  'AUTH_SMTP_HOST',
  'AUTH_SMTP_PORT',
  'AUTH_SMTP_USER',
  'AUTH_SMTP_PASS',
  'AUTH_SMTP_SECURE',
  'AUTH_SMTP_STARTTLS',
  'AUTH_SMTP_EHLO_HOST',
  'AUTH_EMAIL_FROM',
  'AUTH_GITHUB_ID',
  'AUTH_GITHUB_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
];

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`→ ${message}`);
}

const backendUrl = process.env.CONVEX_SELF_HOSTED_URL;
if (!backendUrl) fail('CONVEX_SELF_HOSTED_URL fehlt.');

function readAdminKey() {
  if (process.env.CONVEX_SELF_HOSTED_ADMIN_KEY) return process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  const file = process.env.CONVEX_ADMIN_KEY_FILE;
  if (file) {
    try {
      return readFileSync(file, 'utf8').trim();
    } catch {
      // reported below
    }
  }
  fail('Kein Admin-Key: CONVEX_SELF_HOSTED_ADMIN_KEY oder CONVEX_ADMIN_KEY_FILE setzen.');
}

const cliEnv = {
  ...process.env,
  CONVEX_SELF_HOSTED_URL: backendUrl,
  CONVEX_SELF_HOSTED_ADMIN_KEY: readAdminKey(),
};

function convex(args, { capture = false } = {}) {
  const result = spawnSync('npx', ['convex', ...args], {
    env: cliEnv,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.status !== 0) fail(`npx convex ${args[0]} ist fehlgeschlagen.`);
  return result.stdout ?? '';
}

async function waitForBackend() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(`${backendUrl}/version`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    if (attempt === 1) log(`Warte auf das Convex-Backend unter ${backendUrl} …`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  fail(`Convex-Backend unter ${backendUrl} antwortet nicht.`);
}

function currentEnv() {
  const values = new Map();
  for (const line of convex(['env', 'list'], { capture: true }).split('\n')) {
    const index = line.indexOf('=');
    if (index > 0) values.set(line.slice(0, index), line.slice(index + 1));
  }
  return values;
}

/** Values go through a file, so keys starting with "-----BEGIN" are not parsed as flags */
function setEnv(name, value) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bazarpro-env-'));
  try {
    const file = path.join(dir, 'value');
    writeFileSync(file, value, { mode: 0o600 });
    convex(['env', 'set', name, '--from-file', file, '--force'], { capture: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function generateJwtKeys() {
  const { exportJWK, exportPKCS8, generateKeyPair } = await import('jose');
  const keys = await generateKeyPair('RS256', { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const publicKey = await exportJWK(keys.publicKey);
  return {
    JWT_PRIVATE_KEY: privateKey.trimEnd().replace(/\n/g, ' '),
    JWKS: JSON.stringify({ keys: [{ use: 'sig', ...publicKey }] }),
  };
}

async function setup() {
  const siteUrl = process.env.SITE_URL?.replace(/\/+$/, '');
  if (!siteUrl) fail('SITE_URL fehlt (z. B. https://basar.example.org).');

  await waitForBackend();

  log('Convex-Funktionen deployen …');
  convex(['deploy', '--yes', '--typecheck', 'disable', '--codegen', 'disable']);

  const existing = currentEnv();
  const updates = new Map([['SITE_URL', siteUrl]]);
  if (!existing.get('JWT_PRIVATE_KEY') || !existing.get('JWKS')) {
    log('Schlüssel für die Anmeldung erzeugen …');
    for (const [name, value] of Object.entries(await generateJwtKeys())) updates.set(name, value);
  }
  for (const name of OPTIONAL_SETTINGS) {
    const value = process.env[name];
    if (value) updates.set(name, value);
  }
  for (const [name, value] of updates) {
    if (existing.get(name) === value) continue;
    log(`${name} setzen`);
    setEnv(name, value);
  }

  if (!existing.get('AUTH_SMTP_HOST') && !process.env.AUTH_SMTP_HOST) {
    console.warn(
      '\n! Kein SMTP-Server konfiguriert. Ohne E-Mail-Versand können sich neue Nutzer nicht registrieren.'
    );
  }
  console.log(`\n✓ Convex ist eingerichtet. BazarPro läuft unter ${siteUrl}`);
}

const [command, argument] = process.argv.slice(2);

switch (command ?? 'setup') {
  case 'setup':
    await setup();
    break;
  case 'admin':
    if (!argument) fail('Aufruf: admin <email>');
    await waitForBackend();
    convex(['run', 'users:makeAdmin', JSON.stringify({ email: argument })]);
    break;
  case 'seed':
    await waitForBackend();
    convex(['run', 'seed:runSeed']);
    break;
  default:
    fail(`Unbekannter Befehl "${command}". Erlaubt: setup, admin <email>, seed`);
}
