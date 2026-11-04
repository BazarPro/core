import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import {
  SORT_COLORS,
  SORT_SHAPES,
  clashingSortCodes,
  compareSortCodes,
  sortMark,
  sortMarkLayout,
  sortMarkText,
} from './sortCode';

describe('sortMark', () => {
  it('has ten colors and ten different shapes', () => {
    expect(SORT_COLORS).toHaveLength(10);
    expect(new Set(SORT_SHAPES.map((shape) => shape.id)).size).toBe(10);
  });

  it('never gives two sellers the same mark, also far beyond the first letter', () => {
    const seen = new Set<string>();
    for (let code = 0; code < 300_000; code++) seen.add(sortMarkText(code));
    expect(seen.size).toBe(300_000);
  });

  it('has no letter for the first 100,000 codes, then A, B, ... and never runs out', () => {
    expect(sortMark(99_999).letter).toBe('');
    expect(sortMark(100_000).letter).toBe('A');
    expect(sortMark(200_000).letter).toBe('B');
    expect(sortMark(2_600_000).letter).toBe('Z');
    expect(sortMark(2_700_000).letter).toBe('AA');
  });

  it('takes the pile from the last digit of the code', () => {
    expect(sortMark(66_647).pile).toBe(7);
    expect(sortMark(2_374).pile).toBe(4);
  });

  it('reads the marks from the code, with color from the tens and shape from the ones', () => {
    expect(sortMark(66_647).baskets).toEqual([66, 64]);
    expect(sortMark(47_573).baskets).toEqual([47, 57]);
  });

  it('shows the mark as text', () => {
    expect(sortMarkText(66_647)).toBe('7 · 66 · 64');
    expect(sortMarkText(166_647)).toBe('7 · 66 · 64 A');
  });
});

describe('clashingSortCodes', () => {
  it('finds baskets that differ by the letter only', () => {
    expect(clashingSortCodes([247, 100_247, 248, 248])).toEqual(new Set([247, 100_247]));
    expect(clashingSortCodes([1, 2, 3]).size).toBe(0);
  });
});

describe('compareSortCodes', () => {
  it('sorts by pile, then by the marks, then by the letter', () => {
    const codes = [100_247, 257, 248, 247];
    expect([...codes].sort(compareSortCodes)).toEqual([247, 100_247, 257, 248]);
  });
});

describe('sortMarkLayout', () => {
  // Small and large labels, a sorting sheet and the badge in the app
  const SIZES = [
    [18.3, 11],
    [19.1, 11.5],
    [180, 90],
    [183, 110],
  ];
  // A, W (the widest letter), AA, AAA
  const LETTERED = [100_000, 2_300_000, 2_700_000, 70_300_000];

  it('moves nothing for a letter, in any size', () => {
    for (const [width, height] of SIZES) {
      const { letters: none, ...plain } = sortMarkLayout(sortMark(66_647), width, height);
      expect(none).toEqual([]);
      for (const code of LETTERED) {
        const { letters, ...lettered } = sortMarkLayout(sortMark(code + 66_647), width, height);
        expect(lettered).toEqual(plain);
        expect(letters).toHaveLength(sortMark(code).letter.length);
      }
    }
  });

  it('keeps letters inside the pile and clear of the digit, in any size', () => {
    const doc = new jsPDF({ unit: 'mm' });
    doc.setFont('helvetica', 'bold');
    const pts = doc.internal.scaleFactor;
    for (const [width, height] of SIZES) {
      for (const code of LETTERED) {
        const { pile, letters } = sortMarkLayout(sortMark(code + 66_647), width, height);
        doc.setFontSize(pile.digit.em * pts);
        const digitRight = pile.digit.x + doc.getTextWidth('7') / 2;
        for (const { char, x, y, em } of letters) {
          doc.setFontSize(em * pts);
          const half = doc.getTextWidth(char) / 2;
          expect(x - half).toBeGreaterThanOrEqual(digitRight);
          expect(x + half).toBeLessThanOrEqual(pile.x + pile.width);
          expect(y - em * 0.72).toBeGreaterThanOrEqual(pile.y);
          expect(y).toBeLessThanOrEqual(pile.y + pile.height);
        }
      }
    }
  });
});
