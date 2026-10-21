// Shared by the k6 scenarios: calls a query or mutation like the app's API client.
import http from 'k6/http';
import { check } from 'k6';

export const BASE = __ENV.BASE || 'http://127.0.0.1:3000/api';
/** Written by prepare.mjs: event, products and cashier sessions. */
export const DATA = JSON.parse(open('/bench/.data.json'));

export function call(type, name, args, params = {}) {
  const res = http.post(`${BASE}/${type}/${name}`, JSON.stringify(args), {
    ...params,
    headers: { 'content-type': 'application/json', ...(params.headers || {}) },
    tags: { fn: name, ...(params.tags || {}) },
  });
  const ok = check(res, { [`${name} 200`]: (r) => r.status === 200 });
  if (!ok && __ENV.DEBUG) console.log(name, res.status, String(res.body).slice(0, 300));
  try {
    return JSON.parse(res.body);
  } catch (_) {
    return undefined;
  }
}

export const query = (name, args, params) => call('query', name, args, params);
export const mutation = (name, args, params) => call('mutation', name, args, params);

/** What the public event page loads. */
export const EVENT_PAGE = [
  ['users.viewer', {}],
  ['events.get', { includePast: false }],
  ['events.getPublicEventForViewer', { id: DATA.event }],
  ['eventProducts.getProductsForEvent', { eventId: DATA.event }],
  ['categories.getAllCategories', {}],
];
