import { describe, expect, it } from 'vitest';
import { defaultPromoContent, switchAudience, type PromoEvent } from './promoContent';

const event: PromoEvent = {
  title: 'Skibasar',
  description: 'Gebrauchte Ski. Mehr Text.',
  location: 'Mehrzweckhalle',
  street: 'Am Sportplatz 2',
  postalCode: '89134',
  city: 'Blaustein',
  // 18 Nov 2026, 9:00–14:00 in Berlin
  startDate: Date.UTC(2026, 10, 18, 8),
  endDate: Date.UTC(2026, 10, 18, 13),
  contactInfo: 'ski@example.org',
  services: ['Parkplatz', 'Getränke'],
  commission: 10,
  categoryLabels: ['Ski', 'Schuhe'],
  features: { labelMark: 'universal', intakeFee: 1, maxItemsPerSeller: 40 },
  sellerLogistics: {
    dropoffStart: Date.UTC(2026, 10, 17, 15),
    dropoffEnd: Date.UTC(2026, 10, 17, 18),
  },
};

describe('defaultPromoContent', () => {
  it('fills in date, place and the blocks of the audience', () => {
    const content = defaultPromoContent(event, 'visitors');
    expect(content.dateLine).toBe('Mittwoch, 18. November 2026 · 9:00–14:00 Uhr');
    expect(content.placeLine).toBe('Mehrzweckhalle, Am Sportplatz 2, 89134 Blaustein');
    expect(content.blocks.offer.enabled).toBe(true);
    expect(content.blocks.offer.text).toContain('Ski · Schuhe');
    expect(content.blocks.arrival.enabled).toBe(true);
    expect(content.blocks.sell.enabled).toBe(false);
  });

  it('describes selling with the bazaar’s times and fees', () => {
    const { blocks } = defaultPromoContent(event, 'sellers');
    expect(blocks.sell.text).toContain('2. Bis zu 40 Artikel');
    expect(blocks.sell.text).toContain('Abgabe: Dienstag, 17. November 2026, 16:00–19:00 Uhr');
    expect(blocks.sell.text).toContain('1,00 €');
    expect(blocks.labels.enabled).toBe(true);
    // On a flyer the instructions go on the back
    expect(blocks.sell.back).toBe(true);
    expect(blocks.offer.back).toBe(false);
  });

  it('leaves out universal labels and parking the bazaar does not have', () => {
    const plain = { ...event, services: [], features: {} };
    const { blocks } = defaultPromoContent(plain, 'sellers');
    expect(blocks.labels.enabled).toBe(false);
    expect(defaultPromoContent(plain, 'visitors').blocks.arrival.enabled).toBe(false);
  });
});

describe('switchAudience', () => {
  it('keeps changed texts', () => {
    const content = defaultPromoContent(event, 'visitors');
    content.blocks.help.text = 'Eigener Text';
    const helpers = switchAudience(content, event, 'helpers');
    expect(helpers.blocks.help).toMatchObject({ enabled: true, text: 'Eigener Text' });
    expect(helpers.blocks.offer.enabled).toBe(false);
    expect(helpers.kicker).toBe('Helfer gesucht!');
  });
});
