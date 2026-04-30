import { internalAction, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { TableNames, Doc, Id } from './_generated/dataModel';

export const seedCategories = internalMutation({
  args: {},
  handler: async (ctx) => {
    const anyCategory = await ctx.db.query('categories').first();
    if (anyCategory) {
      return;
    }

    const categories = [
      'Kleidung',
      'Schuhe',
      'Sport',
      'Elektronik',
      'Bücher',
      'Spielzeug',
      'Möbel',
      'Haushalt',
      'Accessoires',
      'Sonstiges',
    ];
    for (const label of categories) {
      const existing = await ctx.db
        .query('categories')
        .withIndex('by_label', (q) => q.eq('label', label))
        .unique();
      if (!existing) {
        await ctx.db.insert('categories', {
          label: label,
          updatedAt: Date.now(),
        });
      }
    }

    return 'Categories seeded successfully';
  },
});

export const insertSeedData = internalMutation({
  args: {
    eventImageIds: v.array(v.id('_storage')),
    productImageIds: v.array(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const { eventImageIds, productImageIds } = args;

    // 1. Kategorie "Sport" holen
    const catSport = await ctx.db
      .query('categories')
      .withIndex('by_label', (q) => q.eq('label', 'Sport'))
      .unique();

    if (!catSport) {
      throw new Error('Kategorie "Sport" nicht gefunden. Bitte zuerst Kategorien anlegen.');
    }

    const catSportId = catSport._id;

    // Password hash for "123456"
    const passwordHash =
      '65100a5141a9667926e801573731697a:6061b961e66b635a66ae6a46a35894399203d79c0b65a8518d0ff78c6e2f80630ecc8aff6da48628cb309029ca645b0756e0f8cd56bfce5c6fe2884bc1c6f323';

    // Helper to ensure user with password
    const ensureUser = async (
      email: string,
      name: string,
      role: 'user' | 'admin' = 'user'
    ): Promise<Doc<'users'>> => {
      let userDoc: Doc<'users'> | null = await ctx.db
        .query('users')
        .filter((q) => q.eq(q.field('email'), email))
        .first();

      let userId: Id<'users'>;
      if (!userDoc) {
        userId = await ctx.db.insert('users', {
          name: name,
          email: email,
          firstName: name.split(' ')[0],
          lastName: name.split(' ')[1] || 'User',
          systemRole: role,
          status: 'active',
          isMailConfirmed: true,
          needsOnboarding: false,
        });
        userDoc = await ctx.db.get(userId);
        if (!userDoc) throw new Error(`User not found after insert: ${email}`);
      } else {
        userId = userDoc._id;
      }

      // Check/Add password credential
      const existingAuth = await ctx.db
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .query('authAccounts' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((q: any) => q.eq(q.field('providerAccountId'), email))
        .first();

      if (!existingAuth) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.db.insert('authAccounts' as any, {
          provider: 'password',
          providerAccountId: email,
          emailVerified: email,
          secret: passwordHash,
          userId: userId,
        });
      }
      return userDoc;
    };

    // Create 5 Test Users
    const testUsers = [];
    for (let i = 1; i <= 5; i++) {
      testUsers.push(await ensureUser(`user${i}@bazarpro.de`, `Test User ${i}`));
    }

    // Create Admin and Vendor
    const adminUser = await ensureUser('admin@bazarpro.de', 'Admin User', 'admin');
    const vendorUser = await ensureUser('seller@bazarpro.de', 'Demo Seller', 'user');

    console.log('Füge Daten für Test User hinzu...');

    // Event 1 (User 1)
    const eventIdUser1 = await ctx.db.insert('events', {
      title: 'Fahrrad Flohmarkt Ulm',
      description:
        'Der größte Fahrradmarkt der Region! Verkauf von gebrauchten Fahrrädern, E-Bikes, Ersatzteilen und Zubehör. Kommt vorbei und findet tolle Schnäppchen rund ums Radfahren! Ob für den täglichen Weg zur Arbeit, die sportliche Tour am Wochenende oder das erste Rad für den Nachwuchs – hier wird jeder fündig. Durch die Teilnahme unterstützt du lokale Initiativen für nachhaltige Mobilität und hilfst dabei, Ressourcen zu schonen. Bring dein altes Rad mit und gib ihm ein neues Zuhause oder lass es direkt vor Ort von unseren Experten schätzen.',
      location: 'Ulm Stadtmitte, Münsterplatz',
      startDate: Date.now() + 86400000 * 2,
      endDate: Date.now() + 86400000 * 3,
      contactInfo:
        'Kontakt für Rückfragen: Ulli (ulli.radler@bazarpro.de) oder telefonisch unter 0123-456789 (Mo-Fr 10-18 Uhr).',
      categories: [catSportId],
      services: ['Gastronomie', 'Parkplatz'],
      visibility: 'public',
      commission: 5,
      organizerId: testUsers[0]._id,
      coverImage: eventImageIds[1],
    });
    await ctx.db.insert('eventRole', {
      event: eventIdUser1,
      user: testUsers[0]._id,
      roles: 'organizer',
    });

    // Event 2 (User 2)
    const eventIdUser2 = await ctx.db.insert('events', {
      title: 'Sommerfest & Basar',
      description:
        'Ein buntes Sommerfest für die ganze Familie mit integriertem Flohmarkt-Basar. Genießt leckeres Essen, Live-Musik und stöbert durch eine Vielzahl von Ständen mit Kleidung, Spielzeug, Büchern und Handgemachtem. Für die Kinder gibt es eine Hüpfburg und Kinderschminken. Der Erlös der Standgebühren wird für einen gemeinnützigen Zweck gespendet. Wir freuen uns auf einen sonnigen Tag mit euch!',
      location: 'Stadtpark Grillwiese',
      startDate: Date.now() + 86400000 * 14,
      endDate: Date.now() + 86400000 * 15,
      contactInfo: 'Organisationsteam Sommerfest: sommerfest@bazarpro.de',
      categories: [catSportId],
      services: ['Getränke', 'Gastronomie'],
      visibility: 'public',
      commission: 5,
      organizerId: testUsers[1]._id,
      coverImage: eventImageIds[2],
    });
    await ctx.db.insert('eventRole', {
      event: eventIdUser2,
      user: testUsers[1]._id,
      roles: 'organizer',
    });

    // Produkt 1 (User 3)
    await ctx.db.insert('products', {
      title: 'Hochwertige Outdoor-Jacke',
      description:
        'Verkaufe meine wenig getragene Outdoor-Jacke der Marke NorthFace in Größe L. Sie ist wind- und wasserdicht, atmungsaktiv und ideal für Wanderungen oder den täglichen Weg zur Arbeit bei schlechtem Wetter. Die Jacke hat keinerlei Beschädigungen, alle Reißverschlüsse funktionieren einwandfrei. Farbe: Dunkelblau mit orangen Akzenten. Neupreis lag bei 250€. Tierfreier Nichtraucherhaushalt.',
      condition: 'very-good',
      price: 85.0,
      vendorId: testUsers[2]._id,
      productCategory: catSportId,
      readyForSale: true,
      sold: false,
      images: [productImageIds[2]],
      updatedAt: Date.now(),
    });

    // Produkt 2 (User 4)
    await ctx.db.insert('products', {
      title: 'Wanderstiefel Gr. 42',
      description:
        'Robuste Wanderstiefel von Meindl, Modell "Borneo", Größe 42. Das Leder ist gut gepflegt und wurde regelmäßig gewachst. Die Sohle hat noch ein sehr gutes Profil und bietet sicheren Halt auch in schwierigem Gelände. Ich verkaufe sie nur, weil sie mir nach einer Fußverletzung leider nicht mehr optimal passen. Perfekt für die nächste Bergtour! Einlegesohlen sind frisch gewaschen.',
      condition: 'good',
      price: 60.0,
      vendorId: testUsers[3]._id,
      productCategory: catSportId,
      readyForSale: true,
      sold: false,
      images: [productImageIds[3]],
      updatedAt: Date.now(),
    });

    // 3. Demo Event für Admin anlegen
    const eventId = await ctx.db.insert('events', {
      title: 'Großer Winterflohmarkt 2026',
      coverImage: eventImageIds[0],
      description:
        'Der ultimative Treffpunkt für alle Wintersport-Begeisterten! Pünktlich zum Start der Skisaison veranstalten wir den größten Winterflohmarkt der Region im Olympiapark. Hier findest du alles, was das Herz begehrt: Von Carving-Ski und Snowboards über Schlittschuhe bis hin zu warmer Funktionskleidung und Helmen. Hunderte private Verkäufer bieten ihre gebrauchte Ausrüstung zu fairen Preisen an. Zusätzlich gibt es einen Wachs-Service vor Ort, der deine neuen Ski direkt fit für die Piste macht. Für das leibliche Wohl ist mit Glühwein, Kinderpunsch und deftigen Snacks bestens gesorgt.',
      location: 'München Olympiapark, Olympiahalle Eingang Ost',
      startDate: Date.now() + 86400000 * 7,
      endDate: Date.now() + 86400000 * 8,
      contactInfo:
        'Veranstalter: WinterSport Events GmbH. Email: info@wintermarkt.de, Tel: 089-1234567. Standanmeldungen bitte über die Website.',
      categories: [catSportId],
      services: ['Parkplatz', 'Gastronomie', 'Skiservice'],
      visibility: 'public',
      commission: 10,
      organizerId: adminUser._id,
    });
    await ctx.db.insert('eventRole', {
      event: eventId,
      user: adminUser._id,
      roles: 'organizer',
    });

    // 3a. Laufendes Event für Rabatt-Tests anlegen
    const ongoingEventId = await ctx.db.insert('events', {
      title: 'Laufender Test-Bazar (AKTUELL)',
      coverImage: eventImageIds[1],
      description:
        'Diese Veranstaltung läuft gerade und dient zum Testen der Rabatt-Funktion. Verkäufer können hier während der Laufzeit die Preise ihrer Produkte anpassen.',
      location: 'Test-Halle Mitte',
      startDate: Date.now() - 86400000, // Gestern gestartet
      endDate: Date.now() + 86400000, // Endet morgen
      contactInfo: 'support@bazarpro.de',
      categories: [catSportId],
      services: ['Getränke'],
      visibility: 'public',
      commission: 10,
      organizerId: adminUser._id,
    });
    await ctx.db.insert('eventRole', {
      event: ongoingEventId,
      user: adminUser._id,
      roles: 'organizer',
    });

    // 4. Demo Produkte für Vendor anlegen
    const productId1 = await ctx.db.insert('products', {
      title: 'Atomic Carving Ski 160cm',
      description:
        'Verkaufe meine treuen Atomic Redster Carving Ski in der Länge 160cm. Sie sind etwa 3 Jahre alt und wurden pro Saison ca. 1 Woche gefahren. Der Belag hat vor dem letzten Urlaub einen frischen Service bekommen (Kanten geschliffen, gewachst) und ist in einem top Zustand ohne tiefe Kratzer. Die Bindung ist natürlich dabei und voll funktionsfähig. Ideal für fortgeschrittene Fahrer, die einen sportlichen aber fehlerverzeihenden Ski suchen.',
      condition: 'good',
      price: 120.0,
      vendorId: vendorUser._id,
      productCategory: catSportId,
      readyForSale: true,
      sold: false,
      images: [productImageIds[0], productImageIds[1]],
      updatedAt: Date.now(),
    });

    const productId2 = await ctx.db.insert('products', {
      title: 'Uvex Skihelm Gr. M (55-59cm)',
      description:
        'Sicherheit geht vor! Ich biete hier einen hochwertigen Skihelm der Marke Uvex in Matt-Schwarz an. Größe M, verstellbar für Kopfumfang 55-59cm. Der Helm ist sturzfrei und wurde nur eine Saison getragen, daher ist er praktisch wie neu und hat keine sichtbaren Gebrauchsspuren. Er verfügt über ein verstellbares Belüftungssystem und ein herausnehmbares, waschbares Innenfutter. Neupreis war 89€.',
      condition: 'very-good',
      price: 45.0,
      vendorId: vendorUser._id,
      productCategory: catSportId,
      readyForSale: true,
      sold: false,
      images: [productImageIds[1], productImageIds[2]],
      updatedAt: Date.now(),
    });

    // Neue Produkte (Mountainbike & Kindersitz) für Demo-Zwecke (User 5)
    const productIdMTB = await ctx.db.insert('products', {
      title: "Mountainbike 'Rockrider' 26 Zoll",
      description:
        'Gut erhaltenes Mountainbike für Einsteiger. 21 Gänge, Federgabel vorne. Bremsen und Schaltung wurden erst kürzlich geprüft. Kleine Kratzer am Rahmen, aber technisch einwandfrei.',
      condition: 'good',
      price: 145.0,
      vendorId: testUsers[4]._id,
      productCategory: catSportId,
      readyForSale: true,
      sold: false,
      images: [productImageIds[4], productImageIds[5]], // Zwei Bilder für das MTB
      updatedAt: Date.now(),
    });

    const productIdSeat = await ctx.db.insert('products', {
      title: 'Kindersitz Römer für Fahrrad',
      description:
        'Sicherer Kindersitz für das Fahrrad. Einfache Montage am Rahmen. Inklusive Halterung und Anschnallgurten. Der Bezug ist waschbar und in einem kräftigen Rot.',
      condition: 'very-good',
      price: 35.0,
      vendorId: testUsers[4]._id,
      productCategory: catSportId,
      readyForSale: true,
      sold: false,
      images: [productImageIds[6]],
      updatedAt: Date.now(),
    });

    // 5. Produkte dem Event zuordnen
    await ctx.db.insert('eventProducts', {
      eventId: eventId,
      productId: productId1,
      status: 'available',
    });

    await ctx.db.insert('eventProducts', {
      eventId: eventId,
      productId: productId2,
      status: 'announced',
    });

    // Produkte auch dem laufenden Event zuordnen
    await ctx.db.insert('eventProducts', {
      eventId: ongoingEventId,
      productId: productId1,
      status: 'available',
    });
    await ctx.db.insert('eventProducts', {
      eventId: ongoingEventId,
      productId: productIdMTB,
      status: 'available',
    });
    await ctx.db.insert('eventProducts', {
      eventId: ongoingEventId,
      productId: productIdSeat,
      status: 'announced',
    });

    // --- NEU: Vergangenes Event hinzufügen ---
    const pastEventId = await ctx.db.insert('events', {
      title: 'Historischer Herbst-Flohmarkt 2025',
      coverImage: eventImageIds[2],
      description: 'Ein Rückblick auf unseren erfolgreichen Herbstmarkt vom letzten Jahr.',
      location: 'Altes Rathaus, Ulm',
      startDate: Date.now() - 86400000 * 180, // Vor 6 Monaten
      endDate: Date.now() - 86400000 * 179,
      contactInfo: 'archiv@bazarpro.de',
      categories: [catSportId],
      services: ['Gastronomie'],
      visibility: 'public',
      commission: 10,
      organizerId: adminUser._id,
    });

    await ctx.db.insert('eventRole', {
      event: pastEventId,
      user: adminUser._id,
      roles: 'organizer',
    });

    // Helfer für das vergangene Event (User 1 & 2)
    await ctx.db.insert('eventRole', {
      event: pastEventId,
      user: testUsers[0]._id,
      roles: 'coorganizer',
    });
    await ctx.db.insert('eventRole', {
      event: pastEventId,
      user: testUsers[1]._id,
      roles: 'coorganizer',
    });

    // Verkäufer für das vergangene Event (User 3, 4, 5 & Vendor)
    const pastSellers = [testUsers[2], testUsers[3], testUsers[4], vendorUser];
    for (const seller of pastSellers) {
      await ctx.db.insert('eventRole', {
        event: pastEventId,
        user: seller._id,
        roles: 'seller',
      });
      await ctx.db.insert('eventSeller', {
        event: pastEventId,
        user: seller._id,
        payoutReceived: true,
        totalFee: 0,
        comissionFee: 0,
        numberpayoutAmount: 0,
      });
    }

    // Produkte für das vergangene Event
    const pastProduct1 = await ctx.db.insert('products', {
      title: 'Vintage Lederball',
      description: 'Ein echtes Sammlerstück aus den 70ern.',
      condition: 'good',
      price: 45.0,
      vendorId: testUsers[2]._id,
      productCategory: catSportId,
      readyForSale: true,
      sold: true,
      images: [productImageIds[3]],
      updatedAt: Date.now() - 86400000 * 180,
    });

    const pastProduct2 = await ctx.db.insert('products', {
      title: 'Alte Schlittschuhe Gr. 39',
      description: 'Gut erhaltene Kufen für Einsteiger.',
      condition: 'ok',
      price: 15.0,
      vendorId: testUsers[3]._id,
      productCategory: catSportId,
      readyForSale: true,
      sold: false,
      images: [productImageIds[4]],
      updatedAt: Date.now() - 86400000 * 180,
    });

    await ctx.db.insert('eventProducts', {
      eventId: pastEventId,
      productId: pastProduct1,
      status: 'sold',
    });

    await ctx.db.insert('eventProducts', {
      eventId: pastEventId,
      productId: pastProduct2,
      status: 'returned',
    });

    // Verkauf dokumentieren
    await ctx.db.insert('purchase', {
      event: pastEventId,
      seller: testUsers[2]._id,
      product: pastProduct1,
      totalAmount: 45.0,
      comissionAmount: 4.5,
      payoutAmount: 40.5,
      payoutStatus: true,
      payoutDate: Date.now() - 86400000 * 180,
    });

    return 'Daten inkl. Bilder und vergangenem Event angelegt!';
  },
});

export const createStarterProducts = internalMutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Kategorie "Sport" holen oder Fallback
    const catSport = await ctx.db
      .query('categories')
      .withIndex('by_label', (q) => q.eq('label', 'Sport'))
      .unique();

    // Fallback falls "Sport" nicht existiert, nimm erste Kategorie
    let catId = catSport?._id;
    if (!catId) {
      const anyCat = await ctx.db.query('categories').first();
      if (anyCat) catId = anyCat._id;
    }

    if (!catId) {
      console.warn('Keine Kategorie gefunden. Starter-Produkte können nicht erstellt werden.');
      return;
    }

    // Versuche existierende Bilder aus der DB zu finden (von vorherigen Seeds)
    const allProducts = await ctx.db.query('products').order('desc').take(20);

    // Filter im Code statt im Query, um .size() Fehler zu vermeiden
    // Suche gezielt nach Bildern für MTB und Kindersitz basierend auf den Titeln
    const mtbTemplate = allProducts.find((p) => p.title.includes('Mountainbike'));
    const seatTemplate = allProducts.find((p) => p.title.includes('Kindersitz'));

    // Produkt 1 für neuen User (Mountainbike)
    await ctx.db.insert('products', {
      title: "Mountainbike 'Rockrider' 26 Zoll",
      description:
        'Gut erhaltenes Mountainbike für Einsteiger. 21 Gänge, Federgabel vorne. Bremsen und Schaltung wurden erst kürzlich geprüft. Kleine Kratzer am Rahmen, aber technisch einwandfrei.',
      condition: 'good',
      price: 145.0,
      vendorId: args.userId,
      productCategory: catId,
      readyForSale: true,
      sold: false,
      images: mtbTemplate?.images || [], // Nimmt die zwei Bilder wenn vorhanden
      updatedAt: Date.now(),
    });

    // Produkt 2 für neuen User (Fahrradhelm)
    await ctx.db.insert('products', {
      title: 'Fahrradhelm Gr. M (55-59cm) FLAIR',
      description:
        'Sicherer Fahrradhelm der Marke FLAIR in Größe M (55-59cm). Verstellbar für optimalen Sitz. Inklusive Belüftungssystem und waschbarem Innenfutter. Der Helm ist sturzfrei und in sehr gutem Zustand.',
      condition: 'very-good',
      price: 35.0,
      vendorId: args.userId,
      productCategory: catId,
      readyForSale: true,
      sold: false,
      images: seatTemplate?.images || [],
      updatedAt: Date.now(),
    });

    console.log(`Starter-Produkte für User ${args.userId} erstellt.`);
  },
});

// 2. Die Action, die die Bilder "besorgt"
export const runSeed = internalAction({
  handler: async (ctx) => {
    // 3 Event Bilder URLs
    const eventImageUrls = [
      'https://images.unsplash.com/photo-1517048676732-d65bc937f952?q=80&w=1000', // Winter/Event (Main)
      'https://images.unsplash.com/photo-1759300632932-09738e21dc13?q=80&w=1470', // Market 2
      'https://images.unsplash.com/photo-1470309864661-68328b2cd0a5?q=80&w=1470', // Market 3
    ];

    // 4 Product Bilder URLs
    const productImageUrls = [
      'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?q=80&w=1000', // Ski
      'https://images.unsplash.com/photo-1670113125057-ac1220b5e90a?q=80&w=1000', // Helmet/Winter gear
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=1000', // Jacket
      'https://images.unsplash.com/photo-1605733160314-4fc7dac4bb16?q=80&w=1000', // Boots
      'https://images.unsplash.com/photo-1673121414328-52eff37bc6d0?q=80&w=1000', // Mountainbike 1
      'https://images.unsplash.com/photo-1728121777927-9dfdfb3058d2?q=80&w=1000', // Mountainbike 2
      'https://images.unsplash.com/photo-1591511275477-88f079d88154?q=80&w=1000', // Fahrradhelm
    ];

    // Helper: URL fetchen und speichern
    const storeImage = async (url: string) => {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`Failed to fetch image: ${url}`);
        // Fallback: Wiederhole erstes Bild oder leer
        const fallbackResp = await fetch(
          'https://images.unsplash.com/photo-1517048676732-d65bc937f952?q=80&w=1000'
        );
        const fallbackBlob = await fallbackResp.blob();
        return await ctx.storage.store(fallbackBlob);
      }
      const blob = await resp.blob();
      return await ctx.storage.store(blob);
    };

    console.log('Lade Event Bilder...');
    const eventImageIds = await Promise.all(eventImageUrls.map(storeImage));

    console.log('Lade Produkt Bilder...');
    const productImageIds = await Promise.all(productImageUrls.map(storeImage));

    await ctx.runMutation(internal.seed.seedCategories, {});

    await ctx.runMutation(internal.seed.seedFeatureFlags, {});

    await ctx.runMutation(internal.seed.insertSeedData, {
      eventImageIds,
      productImageIds,
    });

    return 'Seeding abgeschlossen! Bilder wurden geladen und zugeordnet.';
  },
});

export const seedFeatureFlags = internalMutation({
  args: {},
  handler: async (ctx) => {
    const defaults = [
      { key: 'is_demo_mode', value: true, description: 'Shows a demo banner on the landing page' },
      { key: 'is_login_enabled', value: true, description: 'Enables the login page' },
      {
        key: 'is_registration_enabled',
        value: false,
        description: 'Enables the registration page',
      },
      {
        key: 'is_event_creation_enabled',
        value: true,
        description: 'Enables creation of new events',
      },
      {
        key: 'is_create_products_on_signup_enabled',
        value: true,
        description: 'Enables automatic creation of starter products for new users',
      },
      {
        key: 'allow_undo_inventory_actions',
        value: true,
        description: 'Enables the ability to undo sales and returns in the inventory',
      },
      {
        key: 'is_e2e_auth_skip_email',
        value: false,
        description: 'Skips SMTP delivery in E2E and stores auth verification codes for tests',
      },
    ];

    for (const flag of defaults) {
      const existing = await ctx.db
        .query('featureFlags')
        .withIndex('by_key', (q) => q.eq('key', flag.key))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { value: flag.value, description: flag.description });
      } else {
        await ctx.db.insert('featureFlags', flag);
      }
    }
    return 'Feature flags seeded';
  },
});

export const toggleFeatureFlag = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const flag = await ctx.db
      .query('featureFlags')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .unique();

    if (flag) {
      await ctx.db.patch(flag._id, { value: !flag.value });
    }
  },
});

export const removeAllData = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.CONVEX_DEPLOYMENT_TYPE === 'production') {
      throw new Error('Datenlöschung ist in der Produktionsumgebung nicht erlaubt!');
    }

    const tables = [
      'eventProducts',
      'products',
      'events',
      'categories',
      'users',
      'featureFlags',
      'e2eAuthTokens',
      'authSessions',
      'authRefreshTokens',
      'authAccounts',
    ];

    for (const table of tables) {
      const allRecords = await ctx.db.query(table as TableNames).collect();
      for (const record of allRecords) {
        await ctx.db.delete(record._id);
      }
    }

    return 'All data removed from specified tables.';
  },
});
