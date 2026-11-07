import { formatPriceDE } from './utils';

/** Helpers to show items: placeholder colour and letter, price text, list or tiles. */

/** Stable index into a list of colours for any string, e.g. a title. */
export function tintIndex(seed: string, tintCount: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % tintCount;
}

/** First letter of the title that is a letter, "?" for titles of digits only. */
export function initialOf(title: string): string {
  const letter = title.match(/\p{L}/u)?.[0];
  return (letter ?? title.trim()[0] ?? '?').toUpperCase();
}

/** "8,00 €", whole prices above 999 € without cents as on the labels: "1500 €". */
export function formatItemPrice(price: number): string {
  return `${formatPriceDE(price, price >= 1000 && Number.isInteger(price) ? 0 : 2)} €`;
}

export type ProductViewMode = 'grid' | 'list';

/**
 * The layout the visitor chose for a list of items, or none yet. Per list, so the own
 * items and a bazaar's offers can differ.
 */
export function loadViewMode(key: string): ProductViewMode | undefined {
  try {
    const stored = localStorage.getItem(`bazarpro.view.${key}`);
    return stored === 'grid' || stored === 'list' ? stored : undefined;
  } catch {
    return undefined;
  }
}

export function saveViewMode(key: string, mode: ProductViewMode) {
  try {
    localStorage.setItem(`bazarpro.view.${key}`, mode);
  } catch {
    // Private mode: the choice lasts for this visit
  }
}

/**
 * Tiles suit items with photos, a list suits items without: until the visitor picks one,
 * the list goes by what most items have.
 */
export function autoViewMode(items: readonly { images: readonly unknown[] }[]): ProductViewMode {
  if (items.length === 0) return 'grid';
  const withPhoto = items.filter((item) => item.images.length > 0).length;
  return withPhoto * 2 >= items.length ? 'grid' : 'list';
}
