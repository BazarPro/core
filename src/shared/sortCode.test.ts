import { describe, expect, it } from 'vitest';
import { compareSortCodes, sortMark } from './sortCode';

const signature = (code: number) => {
  const mark = sortMark(code);
  return `${mark.digit}|${mark.fields.map((field) => field.id).join()}|${mark.letter}`;
};

describe('sortMark', () => {
  it('gives every seller an own mark', () => {
    const marks = new Set(Array.from({ length: 30_000 }, (_, code) => signature(code + 1)));
    expect(marks.size).toBe(30_000);
  });

  it('needs no letter for the first 2160 sellers', () => {
    expect(sortMark(1).letter).toBe('');
    expect(sortMark(2159).letter).toBe('');
    expect(sortMark(2160).letter).toBe('A');
    expect(sortMark(2160 * 26).letter).toBe('Z');
    expect(sortMark(2160 * 27).letter).toBe('AA');
  });

  it('makes codes of one pile differ in all fields, also one after the other', () => {
    const [a, b] = [sortMark(15), sortMark(25)];
    expect(a.digit).toBe(b.digit);
    a.fields.forEach((field, i) => expect(field.id).not.toBe(b.fields[i].id));
  });

  it('stays the same: printed labels depend on it', () => {
    expect(signature(175)).toBe('5|diamond,circle,bars|');
  });

  it('sorts by digit first', () => {
    const sorted = [13, 22, 31, 40].sort(compareSortCodes);
    expect(sorted.map((code) => code % 10)).toEqual([0, 1, 2, 3]);
  });
});
