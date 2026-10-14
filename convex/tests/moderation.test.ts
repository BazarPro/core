import { describe, expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';

type TestConvex = ReturnType<typeof convexTest>;

async function setup() {
  const t = convexTest(schema);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert('users', {
      name: 'Admin',
      email: 'admin@test.de',
      systemRole: 'admin',
      status: 'active',
    });
    const organizerId = await ctx.db.insert('users', {
      name: 'Orga',
      email: 'orga@test.de',
      status: 'active',
    });
    const sellerId = await ctx.db.insert('users', {
      name: 'Verkäufer',
      email: 'seller@test.de',
      status: 'active',
    });
    const visitorId = await ctx.db.insert('users', {
      name: 'Besucher',
      email: 'visitor@test.de',
      status: 'active',
    });
    const categoryId = await ctx.db.insert('categories', {
      label: 'Spielzeug',
      updatedAt: Date.now(),
    });
    const eventId = await ctx.db.insert('events', {
      title: 'Basar',
      description: 'Test',
      location: 'Halle',
      startDate: Date.now() - 60_000,
      endDate: Date.now() + 3_600_000,
      contactInfo: 'orga@test.de',
      categories: [categoryId],
      services: [],
      visibility: 'public',
      approvalStatus: 'approved',
      commission: 10,
      organizerId,
      features: { questions: true },
    });
    await ctx.db.insert('eventRole', { event: eventId, user: organizerId, roles: 'organizer' });
    const productId = await ctx.db.insert('products', {
      title: 'Puppenhaus',
      vendorId: sellerId,
      description: 'Holz',
      condition: 'good',
      images: [],
      productCategory: categoryId,
      updatedAt: Date.now(),
      price: 20,
      readyForSale: true,
      sold: false,
    });
    await ctx.db.insert('eventProducts', {
      eventId,
      productId,
      status: 'available',
    });
    return { adminId, organizerId, sellerId, visitorId, categoryId, eventId, productId };
  });
  const as = (userId: Id<'users'>) => t.withIdentity({ subject: userId });
  return { t, ...ids, as };
}

async function scheduledMailsTo(t: TestConvex, address: string) {
  const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
  return jobs.filter(
    (job) => job.name.includes('sendNotification') && (job.args[0] as { to: string }).to === address
  );
}

describe('admins act as organizer of every event', () => {
  test('location areas of a foreign event load for admins', async () => {
    const { eventId, adminId, visitorId, as } = await setup();
    await expect(
      as(adminId).query(api.eventLocationCategories.listForEvent, { eventId })
    ).resolves.toEqual([]);
    await expect(
      as(visitorId).query(api.eventLocationCategories.listForEvent, { eventId })
    ).rejects.toThrow('Not authorized');
  });

  test('admins get the organizer tools on product pages', async () => {
    const { productId, eventId, adminId, visitorId, as } = await setup();
    const forAdmin = await as(adminId).query(api.products.getProduct, { productId });
    expect(forAdmin?.isOrganizer).toBe(true);
    expect(forAdmin?.organizerEventId).toBe(eventId);
    const forVisitor = await as(visitorId).query(api.products.getProduct, { productId });
    expect(forVisitor?.isOrganizer).toBe(false);
  });

  test('banned admins lose their rights', async () => {
    const { t, eventId, adminId, as } = await setup();
    await t.run((ctx) => ctx.db.patch(adminId, { status: 'banned' }));
    await expect(
      as(adminId).query(api.eventLocationCategories.listForEvent, { eventId })
    ).rejects.toThrow('Not authorized');
  });
});

describe('reports', () => {
  test('anonymous reports need an email address', async () => {
    const { t, productId } = await setup();
    await expect(
      t.mutation(api.moderation.reportContent, {
        targetType: 'product',
        targetId: productId,
        reason: 'fraud',
        details: 'Das ist eine Fälschung.',
      })
    ).rejects.toThrow('E-Mail-Adresse');

    await t.mutation(api.moderation.reportContent, {
      targetType: 'product',
      targetId: productId,
      reason: 'fraud',
      details: 'Das ist eine Fälschung.',
      email: 'finder@test.de',
    });
    const reports = await t.run((ctx) => ctx.db.query('reports').collect());
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ status: 'open', reporterEmail: 'finder@test.de' });
  });

  test('the same user cannot report the same content twice while it is open', async () => {
    const { productId, visitorId, as } = await setup();
    const report = {
      targetType: 'product' as const,
      targetId: productId,
      reason: 'spam' as const,
      details: 'Werbung für einen Shop.',
    };
    await as(visitorId).mutation(api.moderation.reportContent, report);
    await expect(as(visitorId).mutation(api.moderation.reportContent, report)).rejects.toThrow(
      'bereits gemeldet'
    );
  });

  test('reports about unknown content are refused', async () => {
    const { visitorId, as } = await setup();
    await expect(
      as(visitorId).mutation(api.moderation.reportContent, {
        targetType: 'product',
        targetId: 'not-an-id',
        reason: 'other',
        details: 'Irgendwas stimmt nicht.',
      })
    ).rejects.toThrow('existiert nicht');
  });

  test('admins are emailed about new reports', async () => {
    const { t, productId, visitorId, as } = await setup();
    await as(visitorId).mutation(api.moderation.reportContent, {
      targetType: 'product',
      targetId: productId,
      reason: 'illegal',
      details: 'Gestohlenes Fahrrad.',
    });
    expect(await scheduledMailsTo(t, 'admin@test.de')).toHaveLength(1);
  });

  test('a flood of anonymous reports is stopped, logged-in users can still report', async () => {
    const { t, productId, visitorId, sellerId, as } = await setup();
    // 30 anonymous reports within the last hour, each with a fresh address
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) {
        await ctx.db.insert('reports', {
          targetType: 'user',
          targetId: sellerId,
          reason: 'spam',
          details: 'Automatisch erzeugt',
          reporterEmail: `bot${i}@spam.test`,
          status: 'dismissed',
          createdAt: Date.now() - 1000,
        });
      }
    });
    const report = {
      targetType: 'product' as const,
      targetId: productId,
      reason: 'spam' as const,
      details: 'Werbung für einen Shop.',
    };
    await expect(
      t.mutation(api.moderation.reportContent, { ...report, email: 'new@spam.test' })
    ).rejects.toThrow('sehr viele Meldungen');
    await as(visitorId).mutation(api.moderation.reportContent, report);
  });

  test('at most ten open reports per content', async () => {
    const { t, productId } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert('reports', {
          targetType: 'product',
          targetId: productId,
          reason: 'spam',
          details: 'Schon gemeldet',
          reporterEmail: `person${i}@test.de`,
          status: 'open',
          createdAt: Date.now() - 2 * 60 * 60 * 1000,
        });
      }
    });
    await expect(
      t.mutation(api.moderation.reportContent, {
        targetType: 'product',
        targetId: productId,
        reason: 'spam',
        details: 'Werbung für einen Shop.',
        email: 'late@test.de',
      })
    ).rejects.toThrow('bereits gemeldet');
  });

  test('admins get one email per reported content and not during a flood', async () => {
    const { t, productId, visitorId, sellerId, organizerId, as } = await setup();
    const report = {
      targetType: 'product' as const,
      targetId: productId,
      reason: 'illegal' as const,
      details: 'Gestohlenes Fahrrad.',
    };
    await as(visitorId).mutation(api.moderation.reportContent, report);
    await as(organizerId).mutation(api.moderation.reportContent, report);
    expect(await scheduledMailsTo(t, 'admin@test.de')).toHaveLength(1);

    // Ten reports in the last hour: the next one only shows up in the badge
    await t.run(async (ctx) => {
      for (let i = 0; i < 8; i++) {
        await ctx.db.insert('reports', {
          targetType: 'product',
          targetId: productId,
          reason: 'spam',
          details: 'Schon gemeldet',
          reporterEmail: `person${i}@test.de`,
          status: 'dismissed',
          createdAt: Date.now() - 1000,
        });
      }
    });
    await as(visitorId).mutation(api.moderation.reportContent, {
      ...report,
      targetType: 'user',
      targetId: sellerId,
    });
    expect(await scheduledMailsTo(t, 'admin@test.de')).toHaveLength(1);
  });

  test('only admins see and close reports', async () => {
    const { t, productId, visitorId, adminId, as } = await setup();
    await as(visitorId).mutation(api.moderation.reportContent, {
      targetType: 'product',
      targetId: productId,
      reason: 'other',
      details: 'Preis ist unrealistisch.',
    });
    await expect(
      as(visitorId).query(api.moderation.listReports, { status: 'open' })
    ).rejects.toThrow('Not authorized');

    const [report] = await as(adminId).query(api.moderation.listReports, { status: 'open' });
    expect(report.target.label).toBe('Puppenhaus');

    await as(adminId).mutation(api.moderation.resolveReport, {
      reportId: report._id,
      status: 'dismissed',
      note: 'Kein Verstoß',
    });
    expect(await as(adminId).query(api.moderation.listReports, { status: 'open' })).toHaveLength(0);
    expect(await scheduledMailsTo(t, 'visitor@test.de')).toHaveLength(1);
    const [entry] = await as(adminId).query(api.moderation.listLog, {});
    expect(entry).toMatchObject({ action: 'dismissReport', reason: 'Kein Verstoß' });
  });
});

describe('hiding items', () => {
  test('a hidden item disappears for visitors but not for its seller and the team', async () => {
    const { t, productId, eventId, adminId, sellerId, organizerId, visitorId, as } = await setup();
    await as(visitorId).mutation(api.moderation.reportContent, {
      targetType: 'product',
      targetId: productId,
      reason: 'illegal',
      details: 'Gestohlenes Spielzeug.',
    });
    const [report] = await as(adminId).query(api.moderation.listReports, { status: 'open' });

    await as(adminId).mutation(api.moderation.hideProduct, {
      productId,
      reason: 'Hinweis auf Diebstahl',
      reportId: report._id,
    });

    expect(await as(visitorId).query(api.products.getProduct, { productId })).toBeNull();
    expect(await t.query(api.products.getProduct, { productId })).toBeNull();
    expect(await as(visitorId).query(api.eventProducts.getProductsForEvent, { eventId })).toEqual(
      []
    );
    const forSeller = await as(sellerId).query(api.products.getProduct, { productId });
    expect(forSeller?.moderation?.reason).toBe('Hinweis auf Diebstahl');
    expect(await as(organizerId).query(api.products.getProduct, { productId })).not.toBeNull();

    // Seller learns the reason, the reporter the outcome, the report is closed
    expect(await scheduledMailsTo(t, 'seller@test.de')).toHaveLength(1);
    expect(await scheduledMailsTo(t, 'visitor@test.de')).toHaveLength(1);
    expect(await as(adminId).query(api.moderation.listReports, { status: 'open' })).toHaveLength(0);

    await expect(
      as(visitorId).mutation(api.productQuestions.ask, { productId, question: 'Noch da?' })
    ).rejects.toThrow('nicht gefunden');

    await as(adminId).mutation(api.moderation.restoreProduct, { productId });
    expect(await as(visitorId).query(api.products.getProduct, { productId })).not.toBeNull();

    const log = await as(adminId).query(api.moderation.listLog, {});
    expect(log.map((e) => e.action)).toEqual(['restoreProduct', 'hideProduct']);
  });

  test('a reason is required and only admins may hide', async () => {
    const { productId, adminId, organizerId, as } = await setup();
    await expect(
      as(adminId).mutation(api.moderation.hideProduct, { productId, reason: ' ' })
    ).rejects.toThrow('Begründung');
    await expect(
      as(organizerId).mutation(api.moderation.hideProduct, { productId, reason: 'Unpassend' })
    ).rejects.toThrow('Not authorized');
  });
});

describe('blocking events', () => {
  test('a blocked event is gone for visitors and sellers cannot join', async () => {
    const { eventId, adminId, organizerId, visitorId, as, t } = await setup();
    await as(adminId).mutation(api.moderation.hideEvent, {
      eventId,
      reason: 'Betrügerische Veranstaltung',
    });

    const listed = await as(visitorId).query(api.events.get, {});
    expect(listed.map((e) => e._id)).not.toContain(eventId);
    expect(await t.query(api.events.get, {})).toHaveLength(0);
    expect(await as(visitorId).query(api.events.getEvent, { id: eventId })).toBeNull();
    expect(
      await as(visitorId).query(api.events.getPublicEventForViewer, { id: eventId })
    ).toBeNull();
    const forOrganizer = await as(organizerId).query(api.events.getEvent, { id: eventId });
    expect(forOrganizer?.moderation?.reason).toBe('Betrügerische Veranstaltung');

    await expect(as(visitorId).mutation(api.eventSeller.joinEvent, { eventId })).rejects.toThrow(
      'gesperrt'
    );
    expect(await scheduledMailsTo(t, 'orga@test.de')).toHaveLength(1);

    await as(adminId).mutation(api.moderation.restoreEvent, { eventId });
    expect(await as(visitorId).query(api.events.getEvent, { id: eventId })).not.toBeNull();
  });

  test('rejecting a public event is logged and the organizer is told why', async () => {
    const { t, eventId, adminId, as } = await setup();
    await t.run((ctx) => ctx.db.patch(eventId, { approvalStatus: 'pending' }));
    await as(adminId).mutation(api.events.rejectEventForAdmin, {
      eventId,
      reason: 'Bitte Ort genauer angeben',
    });
    const [entry] = await as(adminId).query(api.moderation.listLog, {});
    expect(entry).toMatchObject({ action: 'rejectEvent', reason: 'Bitte Ort genauer angeben' });
    expect(await scheduledMailsTo(t, 'orga@test.de')).toHaveLength(1);
  });
});

describe('questions and accounts', () => {
  test('admins delete questions with a reason and the asker is told', async () => {
    const { t, productId, adminId, visitorId, as } = await setup();
    await as(visitorId).mutation(api.productQuestions.ask, {
      productId,
      question: 'Beleidigende Frage',
    });
    const [question] = await as(adminId).query(api.moderation.listQuestions, {});
    expect(question.productTitle).toBe('Puppenhaus');

    await as(adminId).mutation(api.moderation.deleteQuestion, {
      questionId: question._id,
      reason: 'Beleidigung',
    });
    expect(await t.query(api.productQuestions.listForProduct, { productId })).toHaveLength(0);
    expect(await scheduledMailsTo(t, 'visitor@test.de')).toHaveLength(1);
    const [entry] = await as(adminId).query(api.moderation.listLog, {});
    expect(entry.targetLabel).toContain('Beleidigende Frage');
  });

  test('banning needs a reason, spares admins and is logged', async () => {
    const { t, adminId, visitorId, as } = await setup();
    const otherAdmin = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Admin 2', systemRole: 'admin', status: 'active' })
    );
    await expect(
      as(adminId).mutation(api.moderation.banUser, { userId: otherAdmin, reason: 'Test test' })
    ).rejects.toThrow('Administratoren');

    await as(adminId).mutation(api.moderation.banUser, {
      userId: visitorId,
      reason: 'Wiederholter Spam',
    });
    expect((await t.run((ctx) => ctx.db.get(visitorId)))?.status).toBe('banned');
    const summary = await as(adminId).query(api.moderation.getUserSummary, {
      userId: visitorId,
    });
    expect(summary?.history.map((e) => e.action)).toEqual(['banUser']);

    await as(adminId).mutation(api.moderation.unbanUser, { userId: visitorId });
    expect((await t.run((ctx) => ctx.db.get(visitorId)))?.status).toBe('active');
  });

  test('overview counts what needs attention', async () => {
    const { t, productId, adminId, visitorId, as } = await setup();
    await t.mutation(api.messages.sendMessage, {
      name: 'Gast',
      email: 'gast@test.de',
      message: 'Hallo',
      acceptedPrivacyPolicy: true,
    });
    await as(visitorId).mutation(api.moderation.reportContent, {
      targetType: 'product',
      targetId: productId,
      reason: 'spam',
      details: 'Werbung für einen Shop.',
    });
    const overview = await as(adminId).query(api.moderation.getOverview, {});
    expect(overview).toMatchObject({ openReports: 1, unhandledMessages: 1, runningEvents: 1 });

    const [message] = await as(adminId).query(api.moderation.listMessages, { handled: false });
    await as(adminId).mutation(api.moderation.setMessageHandled, {
      messageId: message._id,
      handled: true,
    });
    expect((await as(adminId).query(api.moderation.getOverview, {})).unhandledMessages).toBe(0);
  });

  test('overview counts events by date and approval and hidden content', async () => {
    const { t, productId, eventId, organizerId, categoryId, adminId, as } = await setup();
    const event = (overrides: Partial<Doc<'events'>>) =>
      t.run((ctx) =>
        ctx.db.insert('events', {
          title: 'Weiterer Basar',
          description: 'Test',
          location: 'Halle',
          startDate: Date.now() + 86_400_000,
          endDate: Date.now() + 90_000_000,
          contactInfo: 'orga@test.de',
          categories: [categoryId],
          services: [],
          visibility: 'public',
          approvalStatus: 'approved',
          commission: 10,
          organizerId,
          ...overrides,
        })
      );
    await event({ approvalStatus: 'pending' });
    await event({ approvalStatus: 'pending', visibility: 'logged-in' });
    await event({ startDate: Date.now() - 90_000_000, endDate: Date.now() - 86_400_000 });

    const admin = as(adminId);
    await admin.mutation(api.moderation.hideProduct, { productId, reason: 'Gefälschte Ware' });
    await admin.mutation(api.moderation.hideEvent, { eventId, reason: 'Kein echter Basar' });

    expect(await admin.query(api.moderation.getOverview, {})).toMatchObject({
      pendingEvents: 1,
      runningEvents: 1,
      upcomingEvents: 2,
      products: 1,
      hiddenProducts: 1,
      hiddenEvents: 1,
    });
    const [hidden] = await admin.query(api.moderation.listProducts, { onlyHidden: true });
    expect(hidden._id).toBe(productId);
  });
});

describe('edge cases and filters', () => {
  async function deletedId<
    T extends 'products' | 'events' | 'users' | 'reports' | 'productQuestions',
  >(t: TestConvex, table: T, doc: Record<string, unknown>) {
    return await t.run(async (ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const id = await ctx.db.insert(table, doc as any);
      await ctx.db.delete(id);
      return id;
    });
  }

  test('reports describe events, questions and accounts', async () => {
    const { t, productId, eventId, sellerId, visitorId, adminId, as } = await setup();
    const questionId = await t.run((ctx) =>
      ctx.db.insert('productQuestions', {
        eventId,
        productId,
        askerId: visitorId,
        question: 'Ist das echt?',
        createdAt: Date.now(),
      })
    );
    const details = 'Bitte einmal prüfen.';
    await as(visitorId).mutation(api.moderation.reportContent, {
      targetType: 'event',
      targetId: eventId,
      reason: 'fraud',
      details,
    });
    await as(sellerId).mutation(api.moderation.reportContent, {
      targetType: 'question',
      targetId: questionId,
      reason: 'offensive',
      details,
    });
    await as(sellerId).mutation(api.moderation.reportContent, {
      targetType: 'user',
      targetId: visitorId,
      reason: 'spam',
      details,
    });

    const reports = await as(adminId).query(api.moderation.listReports, { status: 'open' });
    const labels = Object.fromEntries(reports.map((r) => [r.targetType, r.target]));
    expect(labels.event).toMatchObject({ label: 'Basar', ownerName: 'Orga', exists: true });
    expect(labels.question).toMatchObject({ label: '„Ist das echt?“', ownerName: 'Besucher' });
    expect(labels.user).toMatchObject({ label: 'Besucher', isRestricted: false });
    expect(reports.map((r) => r.reporterLabel)).toContain('Verkäufer');

    // Content deleted after the report shows up as deleted
    await t.run((ctx) => ctx.db.delete(questionId));
    const after = await as(adminId).query(api.moderation.listReports, { status: 'open' });
    expect(after.find((r) => r.targetType === 'question')?.target).toMatchObject({
      label: 'Gelöschter Inhalt',
      exists: false,
    });
  });

  test('report details must have a sensible length', async () => {
    const { productId, visitorId, as } = await setup();
    const report = {
      targetType: 'product' as const,
      targetId: productId,
      reason: 'other' as const,
    };
    await expect(
      as(visitorId).mutation(api.moderation.reportContent, { ...report, details: 'kurz' })
    ).rejects.toThrow('beschreibe kurz');
    await expect(
      as(visitorId).mutation(api.moderation.reportContent, {
        ...report,
        details: 'x'.repeat(2001),
      })
    ).rejects.toThrow('höchstens');
    await expect(
      as(visitorId).mutation(api.moderation.reportContent, {
        ...report,
        targetType: 'event',
        targetId: 'not-an-id',
        details: 'Gibt es nicht mehr.',
      })
    ).rejects.toThrow('existiert nicht');
  });

  test('a reporter can only have a limited number of open reports', async () => {
    const { t, visitorId, sellerId, categoryId, as } = await setup();
    const productIds = await t.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i < 21; i++) {
        ids.push(
          await ctx.db.insert('products', {
            title: `Artikel ${i}`,
            vendorId: sellerId,
            description: 'Test',
            condition: 'good',
            images: [],
            productCategory: categoryId,
            updatedAt: Date.now(),
            price: 1,
            readyForSale: true,
            sold: false,
          })
        );
      }
      return ids;
    });
    for (const productId of productIds.slice(0, 20)) {
      await as(visitorId).mutation(api.moderation.reportContent, {
        targetType: 'product',
        targetId: productId,
        reason: 'spam',
        details: 'Werbung für einen Shop.',
      });
    }
    await expect(
      as(visitorId).mutation(api.moderation.reportContent, {
        targetType: 'product',
        targetId: productIds[20],
        reason: 'spam',
        details: 'Werbung für einen Shop.',
      })
    ).rejects.toThrow('viele offene Meldungen');
  });

  test('anonymous reporters are emailed the outcome and closed reports stay closed', async () => {
    const { t, productId, adminId, as } = await setup();
    await t.mutation(api.moderation.reportContent, {
      targetType: 'product',
      targetId: productId,
      reason: 'fraud',
      details: 'Das ist eine Fälschung.',
      email: 'finder@test.de',
    });
    const [report] = await as(adminId).query(api.moderation.listReports, { status: 'open' });
    expect(report.reporterLabel).toBe('finder@test.de');

    await as(adminId).mutation(api.moderation.resolveReport, {
      reportId: report._id,
      status: 'resolved',
      note: '  ',
    });
    expect(await scheduledMailsTo(t, 'finder@test.de')).toHaveLength(1);
    const [resolved] = await as(adminId).query(api.moderation.listReports, { status: 'resolved' });
    expect(resolved.resolverName).toBe('Admin');
    expect(resolved.resolutionNote).toBeUndefined();
    const [entry] = await as(adminId).query(api.moderation.listLog, {});
    expect(entry).toMatchObject({ action: 'resolveReport', adminName: 'Admin' });

    await expect(
      as(adminId).mutation(api.moderation.resolveReport, {
        reportId: report._id,
        status: 'dismissed',
      })
    ).rejects.toThrow('bereits abgeschlossen');
    const missing = await deletedId(t, 'reports', {
      targetType: 'product',
      targetId: productId,
      reason: 'other',
      details: 'x',
      status: 'open',
      createdAt: 0,
    });
    await expect(
      as(adminId).mutation(api.moderation.resolveReport, { reportId: missing, status: 'resolved' })
    ).rejects.toThrow('nicht gefunden');
  });

  test('decisions on missing content fail and restoring visible content does nothing', async () => {
    const { t, productId, eventId, visitorId, adminId, as } = await setup();
    const product = await t.run((ctx) => ctx.db.get(productId));
    const event = await t.run((ctx) => ctx.db.get(eventId));
    const withoutSystemFields = (doc: object) =>
      Object.fromEntries(Object.entries(doc).filter(([key]) => !key.startsWith('_')));
    const missingProduct = await deletedId(t, 'products', withoutSystemFields(product!));
    const missingEvent = await deletedId(t, 'events', withoutSystemFields(event!));
    const missingUser = await deletedId(t, 'users', { name: 'Weg' });
    const missingQuestion = await deletedId(t, 'productQuestions', {
      eventId,
      productId,
      askerId: visitorId,
      question: 'Weg?',
      createdAt: 0,
    });
    const reason = 'Begründung';
    const admin = as(adminId);

    await expect(
      admin.mutation(api.moderation.hideProduct, { productId: missingProduct, reason })
    ).rejects.toThrow('nicht gefunden');
    await expect(
      admin.mutation(api.moderation.restoreProduct, { productId: missingProduct })
    ).rejects.toThrow('nicht gefunden');
    await expect(
      admin.mutation(api.moderation.hideEvent, { eventId: missingEvent, reason })
    ).rejects.toThrow('nicht gefunden');
    await expect(
      admin.mutation(api.moderation.restoreEvent, { eventId: missingEvent })
    ).rejects.toThrow('nicht gefunden');
    await expect(
      admin.mutation(api.moderation.deleteQuestion, { questionId: missingQuestion, reason })
    ).rejects.toThrow('nicht gefunden');
    await expect(
      admin.mutation(api.moderation.banUser, { userId: missingUser, reason })
    ).rejects.toThrow('nicht gefunden');
    await expect(
      admin.mutation(api.moderation.banUser, { userId: adminId, reason })
    ).rejects.toThrow('selbst');
    await expect(admin.mutation(api.moderation.unbanUser, { userId: missingUser })).rejects.toThrow(
      'nicht gefunden'
    );

    await admin.mutation(api.moderation.restoreProduct, { productId });
    await admin.mutation(api.moderation.restoreEvent, { eventId });
    await admin.mutation(api.moderation.unbanUser, { userId: visitorId });
    expect(await admin.query(api.moderation.listLog, {})).toEqual([]);
    expect(await admin.query(api.moderation.getUserSummary, { userId: missingUser })).toBeNull();
  });

  test('deleting an answered question keeps both texts in the log', async () => {
    const { t, productId, eventId, adminId, visitorId, as } = await setup();
    const questionId = await t.run((ctx) =>
      ctx.db.insert('productQuestions', {
        eventId,
        productId,
        askerId: visitorId,
        question: 'Echt Holz?',
        answer: 'Ja',
        createdAt: Date.now(),
      })
    );
    await as(visitorId).mutation(api.moderation.reportContent, {
      targetType: 'question',
      targetId: questionId,
      reason: 'other',
      details: 'Doppelte Frage im Artikel.',
    });
    const [report] = await as(adminId).query(api.moderation.listReports, { status: 'open' });
    await as(adminId).mutation(api.moderation.deleteQuestion, {
      questionId,
      reason: 'Doppelt gestellt',
      reportId: report._id,
    });
    const [entry] = await as(adminId).query(api.moderation.listLog, {});
    expect(entry.targetLabel).toBe('„Echt Holz?“ / Antwort: „Ja“');
    expect(await as(adminId).query(api.moderation.listReports, { status: 'open' })).toEqual([]);
  });

  test('banning closes reports about the account', async () => {
    const { adminId, sellerId, visitorId, as } = await setup();
    await as(sellerId).mutation(api.moderation.reportContent, {
      targetType: 'user',
      targetId: visitorId,
      reason: 'spam',
      details: 'Schreibt überall Werbung.',
    });
    await as(adminId).mutation(api.moderation.banUser, { userId: visitorId, reason: 'Spam-Konto' });
    const [closed] = await as(adminId).query(api.moderation.listReports, { status: 'resolved' });
    expect(closed.target).toMatchObject({ label: 'Besucher', isRestricted: true });
    const summary = await as(adminId).query(api.moderation.getUserSummary, { userId: visitorId });
    expect(summary).toMatchObject({ status: 'banned', reportCount: 1, isWalkIn: false });
  });

  test('admins browse items and questions with filters', async () => {
    const { t, productId, eventId, sellerId, visitorId, adminId, as } = await setup();
    await t.run((ctx) =>
      ctx.db.insert('productQuestions', {
        eventId,
        productId,
        askerId: visitorId,
        question: 'Wie alt?',
        answer: 'Fünf Jahre',
        createdAt: Date.now(),
      })
    );
    const admin = as(adminId);

    expect(await admin.query(api.moderation.listProducts, { search: 'puppen' })).toHaveLength(1);
    expect(await admin.query(api.moderation.listProducts, { search: 'holz' })).toHaveLength(1);
    expect(await admin.query(api.moderation.listProducts, { search: productId })).toHaveLength(1);
    expect(await admin.query(api.moderation.listProducts, { search: 'auto' })).toHaveLength(0);
    const [byVendor] = await admin.query(api.moderation.listProducts, { vendorId: sellerId });
    expect(byVendor).toMatchObject({ vendorName: 'Verkäufer', imageUrl: null });
    expect(await admin.query(api.moderation.listProducts, { vendorId: visitorId })).toHaveLength(0);
    expect(await admin.query(api.moderation.listProducts, { onlyHidden: true })).toHaveLength(0);

    expect(await admin.query(api.moderation.listQuestions, { search: 'fünf' })).toHaveLength(1);
    expect(await admin.query(api.moderation.listQuestions, { search: 'alt' })).toHaveLength(1);
    expect(await admin.query(api.moderation.listQuestions, { search: 'preis' })).toHaveLength(0);
    expect(await admin.query(api.moderation.listQuestions, { askerId: sellerId })).toHaveLength(0);
    const [question] = await admin.query(api.moderation.listQuestions, { askerId: visitorId });
    expect(question).toMatchObject({ productTitle: 'Puppenhaus', askerName: 'Besucher' });
  });

  test('contact messages can be marked as handled and reopened', async () => {
    const { t, adminId, visitorId, as } = await setup();
    await t.mutation(api.messages.sendMessage, {
      name: 'Gast',
      email: 'gast@test.de',
      message: 'Hallo',
      acceptedPrivacyPolicy: true,
    });
    const admin = as(adminId);
    const [message] = await admin.query(api.moderation.listMessages, { handled: false });
    await admin.mutation(api.moderation.setMessageHandled, {
      messageId: message._id,
      handled: true,
    });
    expect(await admin.query(api.moderation.listMessages, { handled: true })).toHaveLength(1);
    expect(await admin.query(api.moderation.getMenuCounts, {})).toEqual({
      openReports: 0,
      unhandledMessages: 0,
    });

    await admin.mutation(api.moderation.setMessageHandled, {
      messageId: message._id,
      handled: false,
    });
    expect(await admin.query(api.moderation.listMessages, { handled: false })).toHaveLength(1);
    expect(await as(visitorId).query(api.moderation.getMenuCounts, {})).toBeNull();
    expect(await t.query(api.moderation.getMenuCounts, {})).toBeNull();
    expect(await admin.query(api.moderation.isViewerAdmin, {})).toBe(true);
    expect(await as(visitorId).query(api.moderation.isViewerAdmin, {})).toBe(false);
  });
});
