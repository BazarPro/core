import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import {
  SORT_COLORS,
  SORT_LETTERS,
  SORT_PAIRS,
  SORT_PATTERNS,
  clashingSortCodes,
  compareSortCodes,
  sortMark,
  sortMarkLayout,
  sortMarkText,
} from './sortCode';

describe('sortMark', () => {
  it('has ten colors, 19 sort letters and 524 pairs: 9,956,000 codes without an extra letter', () => {
    expect(SORT_COLORS).toHaveLength(10);
    expect(SORT_LETTERS).toHaveLength(19);
    expect(new Set(SORT_PAIRS).size).toBe(524);
    expect(SORT_PATTERNS).toBe(9_956_000);
  });

  it('leaves out letters that look like digits or like each other, and blocked pairs', () => {
    expect(SORT_LETTERS).not.toMatch(/[BGIOQSZ]/);
    expect(SORT_PAIRS.join()).not.toMatch(/[IOQ]/);
    for (const pair of ['HJ', 'KZ', 'NS', 'SA', 'SS']) expect(SORT_PAIRS).not.toContain(pair);
  });

  it('never gives two sellers the same mark, also beyond the first extra letter', () => {
    const seen = new Set<string>();
    const codes = [
      ...Array.from({ length: 200_000 }, (_, i) => i),
      ...Array.from({ length: 1_000 }, (_, i) => SORT_PATTERNS - 500 + i),
      ...Array.from({ length: 1_000 }, (_, i) => 20 * SORT_PATTERNS + i),
    ];
    for (const code of codes) seen.add(sortMarkText(code));
    expect(seen.size).toBe(codes.length);
  });

  it('has no extra letter for the first codes, then A, C, ... and never runs out', () => {
    expect(sortMark(SORT_PATTERNS - 1).extra).toBe('');
    expect(sortMark(SORT_PATTERNS).extra).toBe('A');
    expect(sortMark(2 * SORT_PATTERNS).extra).toBe('C');
    expect(sortMark(19 * SORT_PATTERNS).extra).toBe('Y');
    expect(sortMark(20 * SORT_PATTERNS).extra).toBe('AA');
  });

  it('reads all parts from the code', () => {
    // pile 7, letter index 3 (E), number 27, pair index 100
    const code = 7 + 10 * (3 + 19 * (27 + 100 * 100));
    expect(sortMark(code)).toMatchObject({
      pile: 7,
      letter: 'E',
      number: 27,
      pair: SORT_PAIRS[100],
      extra: '',
    });
    expect(sortMarkText(code)).toBe(`7 E · ${SORT_PAIRS[100]} · 27`);
    expect(sortMarkText(code + SORT_PATTERNS)).toBe(`7 E A · ${SORT_PAIRS[100]} · 27`);
  });

  it('colors the fields by their text, never like the tile and never alike', () => {
    for (let code = 0; code < 50_000; code += 7) {
      const mark = sortMark(code);
      expect(mark.pairColor).not.toBe(mark.pile);
      expect(mark.numberColor).not.toBe(mark.pile);
      expect(mark.numberColor).not.toBe(mark.pairColor);
      expect(sortMark(code + SORT_PATTERNS)).toMatchObject({
        pairColor: mark.pairColor,
        numberColor: mark.numberColor,
      });
    }
  });
});

describe('clashingSortCodes', () => {
  it('finds baskets that differ by the extra letter only', () => {
    expect(clashingSortCodes([247, SORT_PATTERNS + 247, 248, 248])).toEqual(
      new Set([247, SORT_PATTERNS + 247])
    );
    expect(clashingSortCodes([1, 2, 3]).size).toBe(0);
  });
});

describe('compareSortCodes', () => {
  it('sorts by digit, then letter, pair, number and extra letter', () => {
    const letterC = 10;
    const number1 = 10 * 19;
    const pairAC = 10 * 19 * 100;
    const codes = [SORT_PATTERNS + 7, pairAC + 7, number1 + 7, letterC + 7, 7, 3];
    expect([...codes].sort(compareSortCodes)).toEqual([
      3,
      7,
      SORT_PATTERNS + 7,
      number1 + 7,
      pairAC + 7,
      letterC + 7,
    ]);
  });
});

describe('sortMarkLayout', () => {
  // Small and large labels, a sorting sheet and the badge in the app
  const SIZES = [
    [18.8, 11.3],
    [19.1, 11.5],
    [180, 90],
    [183, 110],
  ];
  // A, W (the widest letter), AA, AAA
  const EXTRA = [SORT_PATTERNS, 15 * SORT_PATTERNS, 20 * SORT_PATTERNS, 400 * SORT_PATTERNS];
  // Widest pair and widest sort letter
  const WIDE = 2 + 10 * (14 + 19 * (88 + 100 * SORT_PAIRS.indexOf('WW')));

  it('moves nothing outside the tile for an extra letter, in any size', () => {
    for (const [width, height] of SIZES) {
      const plain = sortMarkLayout(sortMark(WIDE), width, height);
      expect(plain.tile.extra).toBeUndefined();
      for (const extra of EXTRA) {
        const lettered = sortMarkLayout(sortMark(WIDE + extra), width, height);
        expect(lettered.fields).toEqual(plain.fields);
        expect(lettered.tile.digit).toEqual(plain.tile.digit);
        expect(lettered.tile.extra).toBeDefined();
      }
    }
  });

  it('keeps all text inside its box, in any size', () => {
    const doc = new jsPDF({ unit: 'mm' });
    doc.setFont('helvetica', 'bold');
    const pts = doc.internal.scaleFactor;
    const inside = (
      value: string,
      at: { x: number; y: number; em: number },
      box: { x: number; y: number; width: number; height: number }
    ) => {
      doc.setFontSize(at.em * pts);
      const half = doc.getTextWidth(value) / 2;
      expect(at.x - half).toBeGreaterThanOrEqual(box.x);
      expect(at.x + half).toBeLessThanOrEqual(box.x + box.width);
      expect(at.y - at.em * 0.72).toBeGreaterThanOrEqual(box.y);
      expect(at.y).toBeLessThanOrEqual(box.y + box.height);
    };
    for (const [width, height] of SIZES) {
      for (const code of [WIDE, ...EXTRA.map((extra) => WIDE + extra)]) {
        const mark = sortMark(code);
        const { tile, fields } = sortMarkLayout(mark, width, height);
        inside(String(mark.pile), tile.digit, tile);
        inside(mark.letter, tile.letter, tile);
        inside(mark.pair, fields[0].text, fields[0]);
        inside(String(mark.number), fields[1].text, fields[1]);
        if (tile.extra) {
          inside(mark.extra, tile.extra.text, tile.extra);
          // The box sits in the tile and right of the sort letter
          expect(tile.extra.x).toBeGreaterThanOrEqual(tile.x);
          expect(tile.extra.x + tile.extra.width).toBeLessThanOrEqual(tile.x + tile.width);
          doc.setFontSize(tile.letter.em * pts);
          expect(tile.letter.x + doc.getTextWidth(mark.letter) / 2).toBeLessThan(tile.extra.x);
        }
      }
    }
  });
});
