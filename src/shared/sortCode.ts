/**
 * Sorting code of universal labels. Unsold items go back without reading: first into ten
 * piles by the large field, then to the seller's basket by the two marks next to it. A
 * seller keeps the code at every bazaar, so printed labels stay valid.
 *
 * A pile has one color, shape and digit. A basket mark is a number from 00 to 99: its tens
 * give the color and its ones the shape, and the number is printed too. That makes 100,000
 * codes without any addition, and black and white prints still tell them apart by the number.
 * After that a letter is added (A, B, ... Z, AA, ...), so codes never run out or repeat.
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
/**
 * Walks through the basket marks so that sellers next to each other in a pile differ in the
 * colors and shapes of both marks: every digit of the four changes. Coprime to 10,000.
 */
const BASKET_STEP = 1111;

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
  const basket = (Math.floor(code / 10) * BASKET_STEP) % (PATTERNS / 10);
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
  pile: { width: number; shape: { x: number; y: number; size: number }; digitEm: number };
  baskets: { y: number; shapeX: number; numberX: number; size: number; numberEm: number }[];
  letter?: { x: number; em: number };
}

/** Where the parts of a mark go, in the app and in the PDF. Sizes in the unit of the box. */
export function sortMarkLayout(mark: SortMark, width: number, height: number): SortMarkLayout {
  const gap = height * 0.03;
  const size = (height - gap) / 2;
  const numberWidth = size * 0.72;
  const letterWidth = mark.letter ? height * 0.24 * mark.letter.length : 0;
  const pileWidth = width - size - numberWidth - letterWidth - gap;
  const shapeSize = Math.min(height * 0.34, pileWidth * 0.7);
  const shapeX = pileWidth + gap;
  return {
    pile: {
      width: pileWidth,
      shape: { x: (pileWidth - shapeSize) / 2, y: height * 0.07, size: shapeSize },
      digitEm: Math.min(height * 0.62, pileWidth * 1.3),
    },
    baskets: [0, size + gap].map((y) => ({
      y,
      shapeX,
      numberX: shapeX + size + numberWidth / 2,
      size,
      // Two bold digits are about 1.15 of the font size wide
      numberEm: numberWidth / 1.15,
    })),
    letter: mark.letter
      ? { x: width - letterWidth / 2, em: Math.min(height * 0.3, letterWidth / mark.letter.length) }
      : undefined,
  };
}
