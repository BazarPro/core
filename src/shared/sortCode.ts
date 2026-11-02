/**
 * Sorting code of universal labels. Unsold items are sorted back without reading: first
 * into piles by the large digit, then by the three fields. A seller keeps the code at
 * every bazaar, so printed labels stay valid.
 *
 * Every field has a color and its own symbol: most sellers print in black and white, and
 * not every helper tells all colors apart. A letter only appears after the first 2160
 * sellers, to tell two sellers with the same digit and fields apart.
 */

export interface SortSymbol {
  id: 'circle' | 'triangle' | 'square' | 'diamond' | 'cross' | 'bars';
  /** Field color, also distinct for color-blind helpers (Okabe-Ito) */
  fill: [number, number, number];
  /** Color of the symbol on the field, the stronger contrast also in black and white */
  ink: [number, number, number];
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

export const SORT_SYMBOLS: readonly SortSymbol[] = [
  { id: 'circle', fill: [0, 114, 178], ink: WHITE },
  { id: 'triangle', fill: [230, 159, 0], ink: BLACK },
  { id: 'square', fill: [0, 120, 90], ink: WHITE },
  { id: 'diamond', fill: [240, 228, 66], ink: BLACK },
  { id: 'cross', fill: [204, 121, 167], ink: BLACK },
  { id: 'bars', fill: [30, 30, 30], ink: WHITE },
];

const PATTERNS = SORT_SYMBOLS.length ** 3;
/**
 * Walks through all patterns so that neighboring codes differ in all three fields:
 * sellers who sign up one after the other are easy to tell apart. Coprime to PATTERNS.
 */
const PATTERN_STEP = 121;

export interface SortMark {
  digit: number;
  fields: [SortSymbol, SortSymbol, SortSymbol];
  /** Empty for most sellers */
  letter: string;
}

function letterOf(index: number): string {
  let letter = '';
  for (let rest = index; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letter = String.fromCharCode(65 + ((rest - 1) % 26)) + letter;
  }
  return letter;
}

export function sortMark(code: number): SortMark {
  const group = Math.floor(code / 10);
  const pattern = (group * PATTERN_STEP) % PATTERNS;
  const count = SORT_SYMBOLS.length;
  return {
    digit: code % 10,
    fields: [
      SORT_SYMBOLS[Math.floor(pattern / count ** 2)],
      SORT_SYMBOLS[Math.floor(pattern / count) % count],
      SORT_SYMBOLS[pattern % count],
    ],
    letter: letterOf(Math.floor(group / PATTERNS)),
  };
}

/** For putting the baskets in a row in sorting order: by digit, then by the fields. */
export function compareSortCodes(a: number, b: number): number {
  const key = (code: number) => {
    const mark = sortMark(code);
    return [
      mark.digit,
      ...mark.fields.map((field) => SORT_SYMBOLS.indexOf(field)),
      mark.letter.length,
    ];
  };
  const [left, right] = [key(a), key(b)];
  for (const [i, value] of left.entries()) {
    if (value !== right[i]) return value - right[i];
  }
  return sortMark(a).letter.localeCompare(sortMark(b).letter);
}
