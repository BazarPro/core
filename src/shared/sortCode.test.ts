import { describe, expect, it } from 'vitest';
import {
  SORT_COLORS,
  SORT_SHAPES,
  clashingSortCodes,
  compareSortCodes,
  sortMark,
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
    expect(sortMark(247).pile).toBe(7);
    expect(sortMark(2374).pile).toBe(4);
  });

  it('gives neighbors in a pile different colors and shapes in both marks', () => {
    const digits = (value: number) => {
      const [a, b] = sortMark(value).baskets;
      return [Math.floor(a / 10), a % 10, Math.floor(b / 10), b % 10];
    };
    let shared = 0;
    for (let code = 0; code < 99_990; code++) {
      const next = digits(code + 10);
      if (digits(code).some((digit, i) => digit === next[i])) shared++;
    }
    expect(shared).toBe(0);
  });

  it('shows the mark as text', () => {
    expect(sortMarkText(247)).toBe('7 · 66 · 64');
    expect(sortMarkText(100_247)).toBe('7 · 66 · 64 A');
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
