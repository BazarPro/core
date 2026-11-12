import { describe, expect, it } from 'vitest';
import {
  buildImportRows,
  decodeCsv,
  guessTargets,
  parseCondition,
  parseCsv,
  parsePrice,
} from './csvImport';

const TITLES = {
  new: 'Neu',
  'very-good': 'Gebraucht, wie neu',
  good: 'Gebraucht',
  ok: 'Gebraucht mit Mängeln',
};
const CATEGORIES = [
  { _id: 'shoes', label: 'Skischuhe' },
  { _id: 'helmets', label: 'Helme', translations: { en: 'Helmets' } },
];

describe('decodeCsv', () => {
  it('drops the byte order mark of UTF-8', () => {
    const bytes = new TextEncoder().encode('﻿Artikel;Größe');
    expect(decodeCsv(bytes.buffer)).toBe('Artikel;Größe');
  });

  it('reads Windows-1252 as saved by Excel', () => {
    // "Größe" in Windows-1252
    const bytes = new Uint8Array([0x47, 0x72, 0xf6, 0xdf, 0x65]);
    expect(decodeCsv(bytes.buffer)).toBe('Größe');
  });
});

describe('parseCsv', () => {
  it('reads the example of the shop', () => {
    expect(parseCsv('Artikel;Farbe;Preis;Groesse\r\nSkisch. D Neu;schwarz;145;39\r\n')).toEqual({
      header: ['Artikel', 'Farbe', 'Preis', 'Groesse'],
      rows: [['Skisch. D Neu', 'schwarz', '145', '39']],
    });
  });

  it('handles commas, quotes and empty lines', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n\n1,2')).toEqual({
      header: ['a', 'b'],
      rows: [
        ['x, y', 'say "hi"'],
        ['1', '2'],
      ],
    });
  });
});

describe('guessTargets', () => {
  it('recognizes the usual headers, the rest goes to the description', () => {
    expect(guessTargets(['Artikel', 'Farbe', 'Preis', 'Groesse', 'Kategorie', 'Zustand'])).toEqual([
      'title',
      'description',
      'price',
      'size',
      'category',
      'condition',
    ]);
  });

  it('does not take the item number for the title', () => {
    expect(guessTargets(['Artikelnummer', 'Artikelbezeichnung'])).toEqual(['description', 'title']);
  });
});

describe('parsePrice', () => {
  it.each([
    ['145', 145],
    ['145,50', 145.5],
    ['1.234,50 €', 1234.5],
    ['12.5', 12.5],
    ['', undefined],
    ['abc', undefined],
    ['-5', undefined],
  ])('%s → %s', (text, price) => expect(parsePrice(text)).toBe(price));
});

describe('parseCondition', () => {
  it.each([
    ['neu', 'new'],
    ['Gebraucht, wie neu', 'very-good'],
    ['wie neu', 'very-good'],
    ['gebraucht', 'good'],
    ['mit Mängeln', 'ok'],
    ['kaputt?', undefined],
  ])('%s → %s', (text, condition) => expect(parseCondition(text, TITLES)).toBe(condition));
});

describe('buildImportRows', () => {
  const table = parseCsv(
    [
      'Artikel;Farbe;Preis;Groesse;Kategorie',
      'Skisch. D Neu;schwarz;145;39;',
      'Helm;rot;30;M;helmets',
      'Skisch. H;;99;;',
      'Skisch. K;blau;20;134/140 cm;',
      'X;;5;;',
      'Mütze;;;;',
      'Brille;;10;;Brillen',
    ].join('\n')
  );
  const rows = buildImportRows(
    table,
    guessTargets(table.header),
    { categoryId: 'shoes', condition: 'new' },
    CATEGORIES,
    TITLES
  );

  it('keeps the size on the label where the category has a size field', () => {
    expect(rows[0]).toEqual({
      line: 2,
      item: {
        title: 'Skisch. D Neu',
        description: 'Farbe: schwarz',
        condition: 'new',
        productCategory: 'shoes',
        price: 145,
        attributes: { size: '39' },
      },
    });
  });

  it('finds categories by name and keeps sizes of others in the description', () => {
    expect(rows[1].item).toMatchObject({
      productCategory: 'helmets',
      description: 'Groesse: M\nFarbe: rot',
    });
    expect(rows[1].item?.attributes).toBeUndefined();
  });

  it('does not require a size', () => {
    expect(rows[2].item).toMatchObject({ title: 'Skisch. H', description: '' });
  });

  it('names the problem of rows that cannot become items', () => {
    expect(rows.slice(3).map((row) => row.problem)).toEqual([
      { code: 'sizeTooLong', value: '134/140 cm', max: 7 },
      { code: 'titleTooShort' },
      { code: 'priceMissing', value: '' },
      { code: 'categoryUnknown', value: 'Brillen' },
    ]);
  });

  it('needs a category and condition for every row', () => {
    const [row] = buildImportRows(
      parseCsv('Artikel;Preis\nHose;5'),
      ['title', 'price'],
      {},
      CATEGORIES,
      TITLES
    );
    expect(row.problem).toEqual({ code: 'categoryMissing' });
  });
});
