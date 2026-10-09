import { afterEach, describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';

describe('authProviders.configured', () => {
  afterEach(() => vi.unstubAllEnvs());

  test('reports only providers with id and secret', async () => {
    vi.stubEnv('AUTH_GITHUB_ID', 'id');
    vi.stubEnv('AUTH_GITHUB_SECRET', 'secret');
    vi.stubEnv('AUTH_GOOGLE_ID', 'id');
    vi.stubEnv('AUTH_GOOGLE_SECRET', '');
    const t = convexTest(schema);
    expect(await t.query(api.authProviders.configured, {})).toEqual({
      google: false,
      github: true,
    });
  });
});
