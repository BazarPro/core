import { describe, expect, it } from 'vitest';
import { restorePromoSettings } from './promoSettings';
import type { PromoEvent } from './promoContent';

const event: PromoEvent = {
  title: 'Kinderbasar',
  description: 'Alles fürs Kind.',
  location: 'Turnhalle',
  startDate: Date.UTC(2026, 10, 18, 8),
  endDate: Date.UTC(2026, 10, 18, 13),
  contactInfo: 'kita@example.org',
  services: [],
  commission: 15,
  categoryLabels: [],
  features: { labelMark: 'universal' },
};

describe('restorePromoSettings', () => {
  it('starts from the bazaar without saved settings', () => {
    const settings = restorePromoSettings(null, event);
    expect(settings).toMatchObject({ format: 'poster', design: 'photo', imageFocus: 50 });
    expect(settings.content.title).toBe('Kinderbasar');
  });

  it('keeps saved texts and fills in what is missing', () => {
    const settings = restorePromoSettings(
      {
        format: 'flyer',
        design: 'eco',
        color: '#0f8a5f',
        imageFocus: 20,
        content: {
          audience: 'sellers',
          title: 'Großer Kinderbasar',
          blocks: { sell: { text: 'Eigener Ablauf' } },
        },
      },
      event
    );
    expect(settings).toMatchObject({ format: 'flyer', design: 'eco', color: '#0f8a5f' });
    expect(settings.content.title).toBe('Großer Kinderbasar');
    expect(settings.content.blocks.sell).toMatchObject({
      text: 'Eigener Ablauf',
      enabled: true,
      back: true,
    });
    // Not saved: the defaults of the audience
    expect(settings.content.kicker).toBe('Jetzt Verkäufer werden');
    expect(settings.content.blocks.offer.enabled).toBe(false);
  });

  it('ignores values this version does not know', () => {
    const settings = restorePromoSettings(
      { format: 'billboard', design: 'neon', color: 'red', imageFocus: 500, content: 'x' },
      event
    );
    expect(settings).toMatchObject({ format: 'poster', design: 'photo', imageFocus: 100 });
    expect(settings.color).toMatch(/^#/);
    expect(settings.content.audience).toBe('visitors');
  });
});
