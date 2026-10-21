// Shared by the k6 scenarios: calls a query or mutation like the app's API client.
import http from 'k6/http';
import { check } from 'k6';

export const BASE = __ENV.BASE || 'http://127.0.0.1:3000/api';
/** Written by prepare.mjs: event, products and cashier sessions. */
export const DATA = JSON.parse(open('/bench/.data.json'));

/** `params.expected`: error codes that are a normal outcome, e.g. an item sold meanwhile. */
export function call(type, name, args, params = {}) {
  const { expected = [], ...rest } = params;
  const res = http.post(`${BASE}/${type}/${name}`, JSON.stringify(args), {
    ...rest,
    responseCallback: http.expectedStatuses(200, ...(expected.length ? [400] : [])),
    headers: { 'content-type': 'application/json', ...(rest.headers || {}) },
    tags: { fn: name, ...(rest.tags || {}) },
  });
  const code = res.status === 200 ? null : String(res.body).match(/"code":"([^"]+)"/)?.[1];
  const ok = check(res, { [name]: (r) => r.status === 200 || expected.includes(code) });
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
