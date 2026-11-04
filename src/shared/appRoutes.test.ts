import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES, isAppRoute } from './appRoutes';

describe('APP_ROUTES', () => {
  it('lists exactly the routes of App.tsx', () => {
    const app = readFileSync(path.join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    const routes = [...app.matchAll(/\spath="([^"]+)"/g)].map((match) => match[1]);
    expect(routes.filter((route) => route !== '*').sort()).toEqual([...APP_ROUTES].sort());
  });
});

describe('isAppRoute', () => {
  it('matches static and parameterized routes like React Router', () => {
    expect(isAppRoute('/')).toBe(true);
    expect(isAppRoute('/features')).toBe(true);
    expect(isAppRoute('/Features/')).toBe(true);
    expect(isAppRoute('/public-events/abc/products')).toBe(true);
    expect(isAppRoute('/events/view/abc/checkout')).toBe(true);
  });

  it('rejects unknown paths and missing parameters', () => {
    expect(isAppRoute('/does-not-exist')).toBe(false);
    expect(isAppRoute('/features/extra')).toBe(false);
    expect(isAppRoute('/public-events/')).toBe(false);
    expect(isAppRoute('/p/')).toBe(false);
    expect(isAppRoute('//')).toBe(false);
  });
});
