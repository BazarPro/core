import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';

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

describe('legal pages', () => {
  test('nothing saved yet: public get returns null', async () => {
    const { t } = await setup();
    expect(await t.query(api.sitePages.get, { slug: 'imprint' })).toBeNull();
  });

  test('only admins save; every change is a new version, unchanged saves are not', async () => {
    const { t, asAdmin, asUser } = await setup();
    const page = { slug: 'imprint' as const, title: 'Impressum', markdown: '## Angaben\n\nVerein' };
    await expect(asUser.mutation(api.sitePages.save, page)).rejects.toThrow('Not authorized');
    await expect(t.mutation(api.sitePages.save, page)).rejects.toThrow('Not authenticated');

    expect(await asAdmin.mutation(api.sitePages.save, page)).toBe(1);
    expect(await asAdmin.mutation(api.sitePages.save, page)).toBe(1);
    expect(
      await asAdmin.mutation(api.sitePages.save, { ...page, markdown: '## Angaben\n\nNeu' })
    ).toBe(2);

    expect(await t.query(api.sitePages.get, { slug: 'imprint' })).toMatchObject({
      title: 'Impressum',
      markdown: '## Angaben\n\nNeu',
      version: 2,
    });
    const versions = await t.run((ctx) => ctx.db.query('sitePageVersions').collect());
    expect(versions.map((v) => [v.slug, v.version, v.markdown])).toEqual([
      ['imprint', 1, '## Angaben\n\nVerein'],
      ['imprint', 2, '## Angaben\n\nNeu'],
    ]);
  });

  test('rejects empty text and too short titles', async () => {
    const { asAdmin } = await setup();
    await expect(
      asAdmin.mutation(api.sitePages.save, { slug: 'terms', title: 'AGB', markdown: '   ' })
    ).rejects.toThrow('nicht leer');
    await expect(
      asAdmin.mutation(api.sitePages.save, { slug: 'terms', title: 'A', markdown: 'Text' })
    ).rejects.toThrow('Titel');
  });

  test('the admin list flags missing pages and placeholders', async () => {
    const { asAdmin, asUser } = await setup();
    await asAdmin.mutation(api.sitePages.save, {
      slug: 'imprint',
      title: 'Impressum',
      markdown: 'Verein: [[Name des Vereins]]',
    });
    await asAdmin.mutation(api.sitePages.save, {
      slug: 'terms',
      title: 'AGB',
      markdown: 'Fertig, mit [Link](https://example.org)',
    });
    const list = await asAdmin.query(api.sitePages.listForAdmin, {});
    expect(list.map((p) => [p.slug, p.version ?? null, p.hasPlaceholders])).toEqual([
      ['imprint', 1, true],
      ['privacy', null, false],
      ['terms', 1, false],
    ]);
    expect(list[0].updatedByName).toBe('Admin');
    await expect(asUser.query(api.sitePages.listForAdmin, {})).rejects.toThrow('Not authorized');
  });
});
