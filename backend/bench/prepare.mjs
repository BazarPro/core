#!/usr/bin/env node
// Prepares a running backend for the load tests and writes bench/.data.json:
// the event, its items and signed-in cashier sessions (platform admins, so they may sell).
//
//   DATABASE_URL=… node backend/bench/prepare.mjs
//
// BASE (http://127.0.0.1:3000/api), EVENT (default: the event with the most items),
// CASHIERS (40), BACKEND_BIN (backend/target/release/bazarpro-backend).
// Turns on is_e2e_auth_skip_email: only for a database of its own, never production.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://127.0.0.1:3000/api';
const CASHIERS = Number(process.env.CASHIERS ?? 40);
const BIN = process.env.BACKEND_BIN ?? join(here, '../target/release/bazarpro-backend');
const PASSWORD = 'Bench-Passw0rd!';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL fehlt (dieselbe Datenbank wie das laufende Backend).');
  process.exit(1);
}

// The CLI opens the file store although these commands never touch it
const cliEnv = {
  STORAGE_DIR: join(tmpdir(), 'bazarpro-bench-files'),
  ...process.env,
  RUN_WORKERS: 'false',
};
const cli = (...args) =>
  execFileSync(BIN, args, { env: cliEnv, stdio: ['ignore', 'pipe', 'inherit'] });

async function post(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  });
  const session = res.headers.getSetCookie().find((c) => c.startsWith('bazarpro_session='));
  return { status: res.status, body: await res.json(), cookie: session?.split(';')[0] };
}

async function cashierSession(i) {
  const email = `bench-kasse${i}@bench.local`;
  const signIn = await post('/auth/password', { flow: 'signIn', email, password: PASSWORD });
  if (signIn.cookie) return { email, cookie: signIn.cookie };
  await post('/auth/password', { flow: 'signUp', email, password: PASSWORD, name: `Kasse ${i}` });
  const { code } = await (
    await fetch(`${BASE}/auth/e2e-code?email=${encodeURIComponent(email)}`)
  ).json();
  const verified = await post('/auth/password', { flow: 'email-verification', email, code });
  if (!verified.cookie)
    throw new Error(`Anmeldung von ${email} fehlgeschlagen: ${JSON.stringify(verified.body)}`);
  return { email, cookie: verified.cookie };
}

cli('run', 'featureFlags.set', JSON.stringify({ key: 'is_e2e_auth_skip_email', value: true }));

let event = process.env.EVENT;
const products = async (id) =>
  (await post('/query/eventProducts.getProductsForEvent', { eventId: id })).body.value ?? [];
if (!event) {
  const events = (await post('/query/events.get', { includePast: true })).body.value;
  const sizes = await Promise.all(events.map(async (e) => [e._id, (await products(e._id)).length]));
  [event] = sizes.sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!event) throw new Error('Keine Veranstaltung gefunden: erst Daten importieren oder seeden.');
}
const items = (await products(event)).map((p) => ({
  productId: p._id,
  eventProductId: p.eventProductId,
}));

const cashiers = [];
for (let i = 0; i < CASHIERS; i++) {
  const { email, cookie } = await cashierSession(i);
  cli('admin', email);
  cashiers.push(cookie);
}

writeFileSync(join(here, '.data.json'), JSON.stringify({ event, products: items, cashiers }));
const available = (await products(event)).filter((p) => p.status === 'available').length;
console.log(
  `Veranstaltung ${event}: ${items.length} Artikel (${available} verkaufbar), ${cashiers.length} Kassen.`
);
if (available < items.length)
  console.log('Zum Verkaufen alle Artikel freigeben, siehe README (Abschnitt Daten).');
