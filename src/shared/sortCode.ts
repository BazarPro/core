/**
 * Sorting code of universal labels. Unsold items go back in two steps: first into ten piles
 * by the large digit and its color, then to the seller's basket. A seller keeps the code at
 * every bazaar, so printed labels stay valid.
 *
 * The mark has a tile and two fields, framed together. The tile holds the pile digit, whose
 * color follows the digit, and a sort letter below it. The fields hold a pair of letters and
 * a number from 00 to 99. Their colors follow from the text, so black and white prints tell
 * marks apart just as well: color only helps to find a basket faster.
 *
 * 10 digits x 19 sort letters x 524 pairs x 100 numbers are 9,956,000 codes. After that an
 * extra letter appears in the tile next to the sort letter (A, C, ... Y, AA, ...), so codes
 * never run out or repeat.
 *
 * The backend draws codes at random (migrations 0021 and 0023), so a code tells nothing
 * about the age of an account and the sellers of a bazaar spread evenly over the piles.
 */

type Rgb = [number, number, number];

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

export const SORT_COLORS: readonly { fill: Rgb; ink: Rgb }[] = [
  { fill: [17, 17, 17], ink: WHITE },
  { fill: [215, 38, 30], ink: WHITE },
  { fill: [11, 95, 196], ink: WHITE },
  { fill: [18, 133, 63], ink: WHITE },
  { fill: [255, 214, 10], ink: BLACK },
  { fill: [245, 124, 0], ink: BLACK },
  { fill: [123, 47, 181], ink: WHITE },
  { fill: [92, 200, 245], ink: BLACK },
  { fill: [242, 119, 180], ink: BLACK },
  { fill: [122, 74, 33], ink: WHITE },
];

/** Letters in the tile: none that looks like a digit (B 8, G 6, S 5, Z 2) or like 0 and 1 */
export const SORT_LETTERS = 'ACDEFHJKLMNPRTUVWXY';
/** Letters of the pair: none that looks like another one (I, O, Q) */
const PAIR_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
/** Pairs that are not printed, as on German number plates */
const BLOCKED_PAIRS = new Set(['HJ', 'KZ', 'NS', 'SA', 'SS']);

export const SORT_PAIRS: readonly string[] = [...PAIR_LETTERS]
  .flatMap((first) => [...PAIR_LETTERS].map((second) => first + second))
  .filter((pair) => !BLOCKED_PAIRS.has(pair));

/** Codes with the same pattern differ by the extra letter only. backend/src/modules/labels.rs */
export const SORT_PATTERNS = 10 * SORT_LETTERS.length * SORT_PAIRS.length * 100;

export interface SortMark {
  /** The pile, 0 to 9: also the color of the tile */
  pile: number;
  /** Below the digit */
  letter: string;
  /** First field: two letters */
  pair: string;
  /** Second field: 0 to 99, printed with two digits */
  number: number;
  /** Next to the sort letter; empty for the first SORT_PATTERNS codes */
  extra: string;
  /** Indexes into SORT_COLORS, never the color of the pile and never the same twice */
  pairColor: number;
  numberColor: number;
}

/** A, C, ... Y, AA, AC, ...: never empty for a positive index, never the same twice. */
function extraOf(index: number): string {
  const base = SORT_LETTERS.length;
  let extra = '';
  for (let rest = index; rest > 0; rest = Math.floor((rest - 1) / base)) {
    extra = SORT_LETTERS[(rest - 1) % base] + extra;
  }
  return extra;
}

/** The color for `seed`, or the next one that is not taken. */
function colorFor(seed: number, taken: number[]): number {
  let color = seed % SORT_COLORS.length;
  while (taken.includes(color)) color = (color + 1) % SORT_COLORS.length;
  return color;
}

export function sortMark(code: number): SortMark {
  let rest = code % SORT_PATTERNS;
  const pile = rest % 10;
  rest = Math.floor(rest / 10);
  const letter = SORT_LETTERS[rest % SORT_LETTERS.length];
  rest = Math.floor(rest / SORT_LETTERS.length);
  const number = rest % 100;
  const pairIndex = Math.floor(rest / 100);
  const pairColor = colorFor(pairIndex, [pile]);
  return {
    pile,
    letter,
    pair: SORT_PAIRS[pairIndex],
    number,
    extra: extraOf(Math.floor(code / SORT_PATTERNS)),
    pairColor,
    numberColor: colorFor(number, [pile, pairColor]),
  };
}

export const sortNumber = (number: number) => String(number).padStart(2, '0');

/** "7 L · KM · 27", or "7 L A · KM · 27" with an extra letter: for screen readers. */
export function sortMarkText(code: number): string {
  const { pile, letter, pair, number, extra } = sortMark(code);
  return `${[pile, letter, extra].filter(Boolean).join(' ')} · ${pair} · ${sortNumber(number)}`;
}

/** Baskets of a bazaar that look alike: same pattern, a different extra letter. */
export function clashingSortCodes(codes: readonly number[]): Set<number> {
  const byPattern = new Map<number, number[]>();
  for (const code of new Set(codes)) {
    const pattern = code % SORT_PATTERNS;
    byPattern.set(pattern, [...(byPattern.get(pattern) ?? []), code]);
  }
  return new Set([...byPattern.values()].filter((same) => same.length > 1).flat());
}

/** For putting the baskets in a row in sorting order: digit, letter, pair, number, extra. */
export function compareSortCodes(a: number, b: number): number {
  const [left, right] = [sortMark(a), sortMark(b)];
  return (
    left.pile - right.pile ||
    SORT_LETTERS.indexOf(left.letter) - SORT_LETTERS.indexOf(right.letter) ||
    SORT_PAIRS.indexOf(left.pair) - SORT_PAIRS.indexOf(right.pair) ||
    left.number - right.number ||
    left.extra.length - right.extra.length ||
    left.extra.localeCompare(right.extra)
  );
}

/** Text in the unit of the box: x is its center, y its baseline. */
interface TextBox {
  x: number;
  y: number;
  em: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface SortMarkLayout {
  /** Width of the frame line around the whole mark */
  frame: number;
  radius: number;
  tile: Box & {
    digit: TextBox;
    letter: TextBox;
    /** The extra letter, light on dark in the tile: only for codes beyond SORT_PATTERNS */
    extra?: Box & { text: TextBox };
  };
  /** The pair, then the number */
  fields: (Box & { text: TextBox })[];
}

/** Height of capitals and digits, in font sizes (Helvetica Bold) */
const CAP = 0.72;
/** Width of the widest letter (W), in font sizes */
const LETTER_WIDTH = 0.95;
/** Two letters of a field, at most (WW), in font sizes */
const PAIR_WIDTH = 1.9;

/** Where the parts of a mark go, in the app and in the PDF. Sizes in the unit of the box. */
export function sortMarkLayout(mark: SortMark, width: number, height: number): SortMarkLayout {
  const inset = height * 0.03;
  const inner = height - 2 * inset;
  const gap = inner * 0.02;
  const tileWidth = inner * 0.9;
  const letterEm = inner * 0.27;
  const letterY = inset + inner * 0.9;
  const tileCenter = inset + tileWidth / 2;

  let letterX = tileCenter;
  let extra: SortMarkLayout['tile']['extra'];
  if (mark.extra) {
    // The sort letter and a small dark box with the extra letters, centered as a row
    const em = (letterEm * 0.85) / Math.max(1, mark.extra.length * 0.8);
    const padding = letterEm * 0.18;
    const boxWidth = mark.extra.length * em * LETTER_WIDTH + 2 * padding;
    const boxHeight = letterEm * 0.95;
    const space = letterEm * 0.25;
    const start = tileCenter - (letterEm * LETTER_WIDTH + space + boxWidth) / 2;
    const middle = letterY - (letterEm * CAP) / 2;
    letterX = start + (letterEm * LETTER_WIDTH) / 2;
    const x = start + letterEm * LETTER_WIDTH + space;
    extra = {
      x,
      y: middle - boxHeight / 2,
      width: boxWidth,
      height: boxHeight,
      radius: boxHeight * 0.2,
      text: { x: x + boxWidth / 2, y: middle + (em * CAP) / 2, em },
    };
  }

  const fieldX = inset + tileWidth + gap;
  const fieldWidth = width - inset - fieldX;
  const fieldHeight = (inner - gap) / 2;
  const fieldEm = Math.min(fieldHeight * 0.76, (fieldWidth * 0.85) / PAIR_WIDTH);
  return {
    frame: height * 0.022,
    radius: height * 0.055,
    tile: {
      x: inset,
      y: inset,
      width: tileWidth,
      height: inner,
      radius: height * 0.05,
      digit: { x: tileCenter, y: inset + inner * 0.55, em: inner * 0.63 },
      letter: { x: letterX, y: letterY, em: letterEm },
      extra,
    },
    fields: [inset, inset + fieldHeight + gap].map((y) => ({
      x: fieldX,
      y,
      width: fieldWidth,
      height: fieldHeight,
      radius: height * 0.04,
      text: { x: fieldX + fieldWidth / 2, y: y + (fieldHeight + fieldEm * CAP) / 2, em: fieldEm },
    })),
  };
}
