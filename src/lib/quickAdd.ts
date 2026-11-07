import { isPriceInRange, PRODUCT_CONDITIONS, type ProductContitions } from '../shared/constants';
import { getCategoryFields, type CategoryField } from '../shared/categoryFields';
import {
  missingForEvent,
  resolveEventFeatures,
  type StoredEventFeatures,
} from '../shared/eventFeatures';

/** Most items at once from one entry: each gets its own label, so keep it countable. */
export const MAX_COPIES = 20;

/**
 * A price as people type it: "2,50", "2.5", "3 €", "1.200" (thousands) or "0" for free.
 * Null for anything else, also negative or too high prices.
 */
export function parsePriceInput(input: string): number | null {
  let text = input.replace(/€|eur/gi, '').replace(/\s/g, '');
  if (!text) return null;
  // "1.200" or "1.200,50": the dot groups thousands
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) text = text.replace(/\./g, '');
  text = text.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const price = Math.round(Number(text) * 100) / 100;
  return isPriceInRange(price) ? price : null;
}

/** Settings kept between entries and visits: what most items of a seller share. */
export interface QuickAddDefaults {
  categoryId: string;
  condition: ProductContitions;
  /** '' for no bazaar */
  eventId: string;
}

const STORAGE_KEY = 'bazarpro.quickAdd';

export function loadQuickAddDefaults(): Partial<QuickAddDefaults> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return {
      categoryId: typeof stored.categoryId === 'string' ? stored.categoryId : undefined,
      condition: PRODUCT_CONDITIONS.includes(stored.condition as ProductContitions)
        ? (stored.condition as ProductContitions)
        : undefined,
      eventId: typeof stored.eventId === 'string' ? stored.eventId : undefined,
    };
  } catch {
    return {};
  }
}

export function saveQuickAddDefaults(defaults: QuickAddDefaults) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    // Private mode: the defaults only last for this visit
  }
}

/**
 * The bazaar to add to: the one the list is filtered by, else the remembered one, else
 * the only upcoming one. Only upcoming bazaars count.
 */
export function pickQuickAddEvent(
  upcoming: readonly { _id: string }[],
  filterEvent: string | undefined,
  remembered: string | undefined
): string {
  const ids = upcoming.map((event) => event._id);
  if (filterEvent && ids.includes(filterEvent)) return filterEvent;
  if (remembered !== undefined && (remembered === '' || ids.includes(remembered))) {
    return remembered;
  }
  return ids.length === 1 ? ids[0] : '';
}

/** The field of the category the quick entry asks for besides title and price: the size. */
export function quickSizeField(
  categoryId: string,
  categories: Parameters<typeof getCategoryFields>[1]
): CategoryField | undefined {
  return getCategoryFields(categoryId, categories).find((field) => field.key === 'size');
}

/**
 * Why a quick entry cannot go to this bazaar as it is: it needs a photo, or a field of
 * the category the quick entry does not ask for (e.g. the frame number of a bike).
 * `asked`: keys of the fields the quick entry has, e.g. the size.
 */
export function quickAddBlocker(
  event: { features?: StoredEventFeatures } | undefined,
  categoryId: string,
  categories: Parameters<typeof getCategoryFields>[1],
  hasPhoto: boolean,
  asked: readonly string[] = []
): { kind: 'photo' } | { kind: 'field'; field: CategoryField } | null {
  if (!event) return null;
  const fields = getCategoryFields(categoryId, categories);
  const required = resolveEventFeatures(event).requiredFields ?? [];
  const field = fields.find(
    (candidate) => required.includes(candidate.key) && !asked.includes(candidate.key)
  );
  if (field) return { kind: 'field', field };
  if (missingForEvent({ images: hasPhoto ? [true] : [] }, event).includes('photo')) {
    return { kind: 'photo' };
  }
  return null;
}
