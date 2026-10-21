// Bazaar day: cash desks sell items while visitors keep the event page open with live
// updates, the way the app's API client does it (queries over HTTP, the WebSocket only
// names changed topics, then the affected queries are refetched).
//   CASHIERS (20), VISITORS (200), DURATION (60s), STAY (30, seconds per visit),
//   CASH_THINK (1, seconds between scans)
import http from 'k6/http';
import ws from 'k6/ws';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import exec from 'k6/execution';
import { BASE, DATA, query, mutation, EVENT_PAGE } from './lib.js';

const CASHIERS = Math.min(Number(__ENV.CASHIERS || 20), DATA.cashiers.length);
const VISITORS = Number(__ENV.VISITORS || 200);
const DURATION = __ENV.DURATION || '60s';
const STAY = Number(__ENV.STAY || 30);
const CASH_THINK = Number(__ENV.CASH_THINK || 1);

const pageLoad = new Trend('page_load', true);
const sale = new Trend('sale', true);
const refetch = new Trend('update_refetch', true);
const updates = new Counter('updates_received');
const wsErrors = new Counter('ws_errors');

export const options = {
  scenarios: {
    ...(CASHIERS > 0 && {
      cashiers: { executor: 'constant-vus', exec: 'cashier', vus: CASHIERS, duration: DURATION },
    }),
    ...(VISITORS > 0 && {
      visitors: {
        executor: 'ramping-vus',
        exec: 'visitor',
        startVUs: 0,
        stages: [
          { duration: '20s', target: VISITORS },
          { duration: DURATION, target: VISITORS },
          { duration: '5s', target: 0 },
        ],
        gracefulRampDown: `${STAY + 10}s`,
      },
    }),
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Scan, sell, and undo the sale so the item can be sold again. Each desk sells its own
// items, like at a real bazaar.
export function cashier() {
  const desk = (exec.vu.idInTest - 1) % CASHIERS;
  const perDesk = Math.max(1, Math.floor(DATA.products.length / CASHIERS));
  const item =
    DATA.products[
      (desk + CASHIERS * (exec.vu.iterationInScenario % perDesk)) % DATA.products.length
    ];
  const params = { headers: { Cookie: DATA.cashiers[desk] } };
  const start = Date.now();
  const found = query(
    'purchases.getCheckoutItem',
    { eventId: DATA.event, productId: item.productId },
    params
  );
  if (found && found.value && found.value.status === 'available') {
    // k6 numbers VUs across scenarios, so two desks may share an item now and then
    const sold = mutation(
      'purchases.sellProduct',
      { eventProductId: item.eventProductId },
      { ...params, expected: ['product.notForSale'] }
    );
    sale.add(Date.now() - start);
    sleep(CASH_THINK);
    if (sold && sold.value) {
      mutation('purchases.undoSale', { eventProductId: item.eventProductId }, params);
    }
  }
  sleep(CASH_THINK);
}

export function visitor() {
  const start = Date.now();
  const entries = EVENT_PAGE.map(([name, args]) => ({
    name,
    args,
    topics: [],
    due: 0,
    lastLoad: Date.now(),
  }));
  const load = (entry) => {
    const res = http.post(`${BASE}/query/${entry.name}`, JSON.stringify(entry.args), {
      headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip' },
      tags: { fn: entry.name },
    });
    try {
      entry.topics = JSON.parse(res.body).topics || [];
    } catch (_) {
      wsErrors.add(1);
    }
  };
  for (const entry of entries) load(entry);
  pageLoad.add(Date.now() - start);

  const res = ws.connect(BASE.replace(/^http/, 'ws') + '/ws', {}, (socket) => {
    socket.on('open', () => {
      const topics = [...new Set(entries.flatMap((e) => e.topics))];
      socket.send(JSON.stringify({ type: 'subscribe', topics }));
    });
    // Like the client: a changed query loads after up to 300 ms, at most once a second
    socket.on('message', (data) => {
      const message = JSON.parse(data);
      const changed = message.type === 'resync' ? null : new Set(message.topics);
      const now = Date.now();
      for (const entry of entries) {
        if (entry.due || (changed && !entry.topics.some((t) => changed.has(t)))) continue;
        entry.due = Math.max(now + Math.random() * 300, entry.lastLoad + 1000);
      }
    });
    socket.setInterval(() => {
      const now = Date.now();
      const todo = entries.filter((entry) => entry.due && entry.due <= now);
      if (todo.length === 0) return;
      for (const entry of todo) {
        entry.due = 0;
        entry.lastLoad = now;
        load(entry);
      }
      updates.add(1);
      refetch.add(Date.now() - now);
    }, 20);
    socket.on('error', () => wsErrors.add(1));
    socket.setTimeout(() => socket.close(), STAY * 1000);
  });
  if (!res || res.status !== 101) wsErrors.add(1);
}
