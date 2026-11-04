#!/usr/bin/env node
// Prints the latencies of a k6 summary export (results/<name>.json) as a short table.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

for (const file of process.argv.slice(2)) {
  const m = JSON.parse(readFileSync(file, 'utf8')).metrics;
  const get = (key, field = 'count') => m[key]?.[field] ?? 0;
  console.log(
    `--- ${basename(file, '.json')}: ${get('http_reqs').toFixed(0)} Requests (${get('http_reqs', 'rate').toFixed(0)}/s), ` +
      `fehlgeschlagen ${(get('http_req_failed', 'value') * 100).toFixed(2)} %, WebSocket-Fehler ${get('ws_errors')}, ` +
      `Live-Updates ${get('updates_received')}, übertragen ${(get('data_received') / 1e6).toFixed(0)} MB`
  );
  const rows = Object.entries(m).filter(
    ([key, v]) =>
      'med' in v &&
      ['http_req_duration', 'page_load', 'sale', 'update_refetch'].some((name) => key.startsWith(name))
  );
  for (const [key, v] of rows.sort()) {
    const label = key.replace('http_req_duration', 'http').padEnd(48);
    const ms = (x) => `${x.toFixed(1)}`.padStart(8);
    console.log(
      `  ${label} med ${ms(v.med)}  p95 ${ms(v['p(95)'])}  p99 ${ms(v['p(99)'])}  max ${ms(v.max)} ms`
    );
  }
}
