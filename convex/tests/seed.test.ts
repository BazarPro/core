import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { internal } from '../_generated/api';

describe('seed.isSeeded', () => {
  test('is false for an empty database', async () => {
    const t = convexTest(schema);
    expect(await t.query(internal.seed.isSeeded, {})).toBe(false);
  });

  test('is true once the seed admin exists', async () => {
    const t = convexTest(schema);
    await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Admin User', email: 'admin@bazarpro.de' })
    );
    expect(await t.query(internal.seed.isSeeded, {})).toBe(true);
  });

  test('runSeed skips an already seeded database', async () => {
    const t = convexTest(schema);
    await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Admin User', email: 'admin@bazarpro.de' })
    );
    await expect(t.action(internal.seed.runSeed, {})).resolves.toMatch(/übersprungen/);
    const events = await t.run((ctx) => ctx.db.query('events').collect());
    expect(events).toHaveLength(0);
  });
});
