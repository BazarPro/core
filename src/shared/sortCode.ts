/**
 * Sorting code of universal labels. Unsold items go back without reading: first into ten
 * piles by the large field, then to the seller's basket by the two marks next to it. A
 * seller keeps the code at every bazaar, so printed labels stay valid.
 *
 * A pile has one color, shape and digit. A basket mark is a number from 00 to 99: its tens
 * give the color and its ones the shape, and the number is printed too. That makes 100,000
 * codes without any addition, and black and white prints still tell them apart by the number.
 * After that a letter is added (A, B, ... Z, AA, ...), so codes never run out or repeat.
 *
 * The backend draws codes at random (migration 0021), so a code tells nothing about the age
 * of an account and the sellers of a bazaar spread evenly over the piles.
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

type Point = [number, number];

const arc = (from: number, to: number, steps: number): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / steps;
    return [50 + 48 * Math.cos(angle), 50 + 48 * Math.sin(angle)];
  });

const heart: Point[] = Array.from({ length: 48 }, (_, i) => {
  const t = (i / 48) * 2 * Math.PI;
  return [
    50 + 3 * 16 * Math.sin(t) ** 3,
    45 - 3 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
  ];
});

/** Outlines in a box of 100 x 100, the same in the app and in the PDF. Index: the digit. */
export const SORT_SHAPES: readonly { id: string; points: Point[] }[] = [
  { id: 'circle', points: arc(0, 2 * Math.PI, 40).slice(1) },
  { id: 'square', points: [[6, 6], [94, 6], [94, 94], [6, 94]] }, // prettier-ignore
  { id: 'triangle', points: [[50, 4], [98, 94], [2, 94]] }, // prettier-ignore
  { id: 'diamond', points: [[50, 1], [99, 50], [50, 99], [1, 50]] }, // prettier-ignore
  {
    id: 'star',
    points: Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const radius = i % 2 === 0 ? 50 : 22;
      return [50 + radius * Math.cos(angle), 53 + radius * Math.sin(angle)] as Point;
    }),
  },
  { id: 'half-circle', points: arc(Math.PI, 2 * Math.PI, 24).map(([x, y]) => [x, y + 24]) },
  {
    id: 'cross',
    points: [
      [33, 3], [67, 3], [67, 33], [97, 33], [97, 67], [67, 67],
      [67, 97], [33, 97], [33, 67], [3, 67], [3, 33], [33, 33],
    ], // prettier-ignore
  },
  { id: 'heart', points: heart },
  {
    id: 'arrow',
    points: [[50, 3], [97, 50], [68, 50], [68, 97], [32, 97], [32, 50], [3, 50]], // prettier-ignore
  },
  { id: 'hourglass', points: [[8, 4], [92, 4], [58, 50], [92, 96], [8, 96], [42, 50]] }, // prettier-ignore
];

/** Codes with the same pattern differ by the letter only. */
const PATTERNS = 100_000;

export interface SortMark {
  /** The pile, 0 to 9: also the color and shape of the large field */
  pile: number;
  /** The two basket marks, 00 to 99: tens are the color, ones the shape */
  baskets: [number, number];
  /** Empty for the first 100,000 codes */
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
  const basket = Math.floor(code / 10) % (PATTERNS / 10);
  return {
    pile: code % 10,
    baskets: [Math.floor(basket / 100), basket % 100],
    letter: letterOf(Math.floor(code / PATTERNS)),
  };
}

export const basketNumber = (basket: number) => String(basket).padStart(2, '0');

/** "7 · 66 · 64 A": the mark as text, for screen readers. */
export function sortMarkText(code: number): string {
  const { pile, baskets, letter } = sortMark(code);
  return [`${pile} · ${baskets.map(basketNumber).join(' · ')}`, letter].filter(Boolean).join(' ');
}

/** Baskets of a bazaar that look alike: same pattern, a different letter. */
export function clashingSortCodes(codes: readonly number[]): Set<number> {
  const byPattern = new Map<number, number[]>();
  for (const code of new Set(codes)) {
    const pattern = code % PATTERNS;
    byPattern.set(pattern, [...(byPattern.get(pattern) ?? []), code]);
  }
  return new Set([...byPattern.values()].filter((same) => same.length > 1).flat());
}

/** For putting the baskets in a row in sorting order: by pile, then by the marks. */
export function compareSortCodes(a: number, b: number): number {
  const [left, right] = [sortMark(a), sortMark(b)];
  return (
    left.pile - right.pile ||
    left.baskets[0] - right.baskets[0] ||
    left.baskets[1] - right.baskets[1] ||
    left.letter.length - right.letter.length ||
    left.letter.localeCompare(right.letter)
  );
}

export interface SortMarkLayout {
  /** Width of the frame line around the whole mark */
  frame: number;
  radius: number;
  pile: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    shape: { x: number; y: number; size: number };
    digit: { x: number; y: number; em: number };
  };
  baskets: {
    shapeX: number;
    y: number;
    size: number;
    number: { x: number; y: number; em: number };
  }[];
  /** Beside the digit, in the free space of the pile: nothing else moves for a letter */
  letters: { char: string; x: number; y: number; em: number }[];
}

/** Width of a bold digit and of the widest letter (W), in font sizes */
const DIGIT_WIDTH = 0.56;
const LETTER_WIDTH = 0.95;
/** Distance of stacked letters, in font sizes */
const LETTER_LINE = 0.85;

/** As large as fits next to the digit, with more letters stacked as high as the digit. */
function letterEm(digitEm: number, pileWidth: number, letters: number): number {
  const beside = ((pileWidth - digitEm * DIGIT_WIDTH) / 2) * 0.9;
  return Math.min(beside / LETTER_WIDTH, (digitEm * 0.85) / (letters * LETTER_LINE));
}

/** Where the parts of a mark go, in the app and in the PDF. Sizes in the unit of the box. */
export function sortMarkLayout(mark: SortMark, width: number, height: number): SortMarkLayout {
  const frame = height * 0.022;
  const inset = height * 0.07;
  const inner = height - 2 * inset;
  const gap = inner * 0.05;
  const size = (inner - gap) / 2;
  const numberWidth = size * 0.8;
  const pileWidth = width - 2 * inset - size - numberWidth - 2 * gap;
  const shapeSize = Math.min(inner * 0.32, pileWidth * 0.7);
  const shapeX = inset + pileWidth + 2 * gap;
  const digitEm = Math.min(inner * 0.6, pileWidth * 1.3);
  // Digits are about 0.72 of the font size high
  return {
    frame,
    radius: height * 0.09,
    pile: {
      x: inset,
      y: inset,
      width: pileWidth,
      height: inner,
      radius: height * 0.05,
      shape: { x: inset + (pileWidth - shapeSize) / 2, y: inset + inner * 0.08, size: shapeSize },
      digit: { x: inset + pileWidth / 2, y: inset + inner * 0.94, em: digitEm },
    },
    baskets: [inset, inset + size + gap].map((y) => {
      // Two bold digits are about 1.15 of the font size wide
      const em = numberWidth / 1.15;
      return {
        shapeX,
        y,
        size,
        number: { x: shapeX + size + numberWidth / 2, y: y + size / 2 + em * 0.36, em },
      };
    }),
    letters: [...mark.letter].reverse().map((char, i) => {
      const em = letterEm(digitEm, pileWidth, mark.letter.length);
      return {
        char,
        x: inset + pileWidth - (pileWidth - digitEm * DIGIT_WIDTH) / 4,
        y: inset + inner * 0.94 - i * em * LETTER_LINE,
        em,
      };
    }),
  };
}
