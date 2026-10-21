import { afterEach, describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api, internal } from '../_generated/api';

async function setup() {
  const t = convexTest(schema);
  const { adminId, userId } = await t.run(async (ctx) => ({
    adminId: await ctx.db.insert('users', {
      name: 'Admin',
      email: 'admin@test.de',
      systemRole: 'admin',
      status: 'active',
    }),
    userId: await ctx.db.insert('users', { name: 'Nutzer', email: 'user@test.de' }),
  }));
  return {
    t,
    asAdmin: t.withIdentity({ subject: adminId }),
    asUser: t.withIdentity({ subject: userId }),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('instance mode', () => {
  test('defaults to platform, single only when configured', async () => {
    const { t } = await setup();
    expect(await t.query(api.instance.getConfig, {})).toMatchObject({ mode: 'platform' });

    vi.stubEnv('BAZARPRO_MODE', 'single');
    expect(await t.query(api.instance.getConfig, {})).toMatchObject({ mode: 'single' });

    vi.stubEnv('BAZARPRO_MODE', 'something-else');
    expect(await t.query(api.instance.getConfig, {})).toMatchObject({ mode: 'platform' });
  });
});

describe('instance settings', () => {
  test('only admins change name, contact and logo', async () => {
    const { t, asAdmin, asUser } = await setup();
    await expect(asUser.mutation(api.instance.updateSettings, { name: 'X' })).rejects.toThrow(
      'auth.forbidden'
    );
    await expect(
      asAdmin.mutation(api.instance.updateSettings, { contactEmail: 'keine-adresse' })
    ).rejects.toThrow('gültige E-Mail');

    const logo = await t.run((ctx) => ctx.storage.store(new Blob(['logo'])));
    await asAdmin.mutation(api.instance.updateSettings, {
      name: '  Kinderbasar Ulm ',
      contactEmail: 'basar@ulm.de',
      logo,
    });
    const config = await t.query(api.instance.getConfig, {});
    expect(config).toMatchObject({ name: 'Kinderbasar Ulm', contactEmail: 'basar@ulm.de' });
    expect(config.logoUrl).toBeTruthy();
  });

  test('replacing or removing the logo deletes the old file; other fields stay', async () => {
    const { t, asAdmin } = await setup();
    const first = await t.run((ctx) => ctx.storage.store(new Blob(['a'])));
    const second = await t.run((ctx) => ctx.storage.store(new Blob(['b'])));
    await asAdmin.mutation(api.instance.updateSettings, { name: 'Basar', logo: first });
    await asAdmin.mutation(api.instance.updateSettings, { name: 'Basar', logo: second });
    expect(await t.run((ctx) => ctx.storage.getUrl(first))).toBeNull();

    // Saving without logo keeps it
    await asAdmin.mutation(api.instance.updateSettings, { name: 'Basar 2' });
    expect((await t.query(api.instance.getConfig, {})).logoUrl).toBeTruthy();

    await asAdmin.mutation(api.instance.updateSettings, { name: 'Basar 2', logo: null });
    expect(await t.run((ctx) => ctx.storage.getUrl(second))).toBeNull();
    expect(await t.query(api.instance.getConfig, {})).toMatchObject({
      name: 'Basar 2',
      logoUrl: null,
    });
    expect(await t.run((ctx) => ctx.db.query('siteSettings').collect())).toHaveLength(1);
  });

  test('the nightly storage cleanup keeps the logo', async () => {
    const { t, asAdmin } = await setup();
    const logo = await t.run((ctx) => ctx.storage.store(new Blob(['logo'])));
    const orphan = await t.run((ctx) => ctx.storage.store(new Blob(['orphan'])));
    await asAdmin.mutation(api.instance.updateSettings, { logo });

    await t.mutation(internal.storageCleanup.cleanupOrphanedUploads, {});
    expect(await t.run((ctx) => ctx.storage.getUrl(logo))).toBeTruthy();
    expect(await t.run((ctx) => ctx.storage.getUrl(orphan))).toBeNull();
  });

  test('analytics settings are validated and kept when only other fields change', async () => {
    const { t, asAdmin } = await setup();
    await expect(
      asAdmin.mutation(api.instance.updateSettings, {
        plausible: { enabled: true, domain: 'https://basar.de', apiHost: 'https://p.example.org' },
      })
    ).rejects.toThrow('ohne https://');
    await expect(
      asAdmin.mutation(api.instance.updateSettings, {
        plausible: { enabled: true, domain: 'basar.de', apiHost: 'http://p.example.org' },
      })
    ).rejects.toThrow('https://');

    await asAdmin.mutation(api.instance.updateSettings, {
      plausible: { enabled: true, domain: 'Basar.DE', apiHost: 'https://p.example.org/' },
    });
    await asAdmin.mutation(api.instance.updateSettings, { name: 'Basar' });
    expect((await t.query(api.instance.getConfig, {})).plausible).toEqual({
      enabled: true,
      domain: 'basar.de',
      apiHost: 'https://p.example.org',
    });

    // Empty fields fall back to the server values
    await asAdmin.mutation(api.instance.updateSettings, {
      plausible: { enabled: false, domain: '', apiHost: '' },
    });
    expect((await t.query(api.instance.getConfig, {})).plausible).toEqual({
      enabled: false,
      domain: undefined,
      apiHost: undefined,
    });
  });

  test('start page: overview by default, kept when other fields change', async () => {
    const { t, asAdmin } = await setup();
    expect((await t.query(api.instance.getConfig, {})).startPage).toBe('overview');
    await asAdmin.mutation(api.instance.updateSettings, { startPage: 'currentEvent' });
    await asAdmin.mutation(api.instance.updateSettings, { name: 'Basar' });
    expect((await t.query(api.instance.getConfig, {})).startPage).toBe('currentEvent');
  });
});
