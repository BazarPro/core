import { describe, expect, it } from 'vitest';
import { describeSellerFees, describeSellerRules, describeSellerSchedule } from './sellerFees';

describe('describeSellerFees', () => {
  it('explains commission and intake fee with an example', () => {
    const { lines, example } = describeSellerFees({ commission: 10, intakeFee: 0.5 });
    expect(lines).toEqual([
      '10 % Provision vom Verkaufspreis jedes verkauften Artikels',
      '0,50 € Annahmegebühr pro angenommenem Artikel, auch wenn er nicht verkauft wird',
    ]);
    expect(example).toEqual({
      intro: 'Du gibst 10 Artikel ab, 6 davon werden für je 5,00 € verkauft.',
      rows: [
        { label: '6 × 5,00 € verkauft', amount: 30 },
        { label: '10 % Provision', amount: -3 },
        { label: 'Annahmegebühr 10 × 0,50 €', amount: -5 },
      ],
      total: 22,
    });
  });

  it('goes negative when the fee is higher than the sales', () => {
    expect(describeSellerFees({ commission: 0, intakeFee: 4 }).example?.total).toBe(-10);
  });

  it('has nothing to explain without fees', () => {
    expect(describeSellerFees({ commission: 0 })).toEqual({ lines: [], example: null });
    expect(describeSellerFees({ commission: 7.5 }).lines[0]).toMatch(/^7,5 % Provision/);
  });
});

describe('describeSellerRules', () => {
  it('names the item limit and every price feature', () => {
    const rules = describeSellerRules({
      commission: 0,
      features: {
        maxItemsPerSeller: 40,
        photosOptional: true,
        discounts: true,
        maxDiscountPercent: 30,
        // 15:00 in Berlin (summer time)
        discountStartsAt: Date.UTC(2026, 9, 17, 13),
        priceOffers: true,
        minimumPrice: true,
        questions: true,
      },
    });
    expect(rules.map((rule) => rule.text)).toEqual([
      'Bis zu 40 Artikel pro Verkäufer',
      'Fotos sind freiwillig',
      'Während des Basars ab 15:00 Uhr kannst du deine Preise um bis zu 30 % senken',
      'Käufer können dir online Preise vorschlagen, du entscheidest',
      'Verhandeln an der Kasse: Du legst einen Mindestpreis fest, bis zu dem die Kasse heruntergehen darf',
      'Käufer können öffentlich Fragen zu deinen Artikeln stellen',
    ]);
    expect(rules.every((rule) => rule.allowed)).toBe(true);
  });

  it('says what is not offered', () => {
    const rules = describeSellerRules({
      commission: 0,
      features: { discounts: false, priceOffers: false, minimumPrice: false },
    });
    expect(rules[0].text).toBe('Beliebig viele Artikel pro Verkäufer');
    expect(rules[1].text).toBe('Jeder Artikel braucht mindestens ein Foto');
    expect(rules.filter((rule) => !rule.allowed).map((rule) => rule.text)).toEqual([
      'Keine Rabatte während des Basars',
      'Keine Preisvorschläge von Käufern',
      'Kein Verhandeln an der Kasse, es gilt dein Preis',
    ]);
  });
});

describe('describeSellerSchedule', () => {
  it('lists hand-in and pickup with the note', () => {
    const schedule = describeSellerSchedule({
      commission: 0,
      sellerLogistics: {
        dropoffStart: Date.UTC(2026, 9, 16, 15),
        dropoffEnd: Date.UTC(2026, 9, 16, 17),
        note: '  Eingang über den Hof ',
      },
    });
    expect(schedule).toEqual({
      rows: [{ label: 'Abgabe', value: 'Freitag, 16. Oktober 2026, 17:00–19:00 Uhr' }],
      note: 'Eingang über den Hof',
    });
  });
});
