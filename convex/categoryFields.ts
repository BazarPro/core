/**
 * Extra item fields per product category (e.g. frame number for bikes, size for clothes).
 * The values live on the product, so an item keeps them when it moves on to the next
 * bazaar. Pure helpers only, so the frontend can import this file as well.
 */

export interface CategoryField {
  key: string;
  /** Translation of label, placeholder and hint: categoryFields.<text> in src/locales */
  text: CategoryFieldText;
  label: string;
  placeholder?: string;
  hint?: string;
}

export type CategoryFieldText =
  | 'frameNumber'
  | 'frameSize'
  | 'wheelSize'
  | 'bikeBrand'
  | 'clothingSize'
  | 'shoeSize'
  | 'sportSize'
  | 'brand'
  | 'model';

const MAX_VALUE_LENGTH = 120;

const BIKE_FIELDS: CategoryField[] = [
  {
    key: 'frameNumber',
    text: 'frameNumber',
    label: 'Rahmennummer',
    placeholder: 'z. B. WBK123456',
    hint: 'Bei Rädern ab ca. 500 € dringend empfohlen.',
  },
  { key: 'frameSize', text: 'frameSize', label: 'Rahmengröße', placeholder: 'z. B. 52 cm oder M' },
  { key: 'wheelSize', text: 'wheelSize', label: 'Laufradgröße', placeholder: 'z. B. 28 Zoll' },
  { key: 'brand', text: 'bikeBrand', label: 'Marke', placeholder: 'z. B. Cube' },
];

const CLOTHING_FIELDS: CategoryField[] = [
  { key: 'size', text: 'clothingSize', label: 'Größe', placeholder: 'z. B. M oder 128' },
  { key: 'brand', text: 'brand', label: 'Marke' },
];

const SHOE_FIELDS: CategoryField[] = [
  { key: 'size', text: 'shoeSize', label: 'Größe (EU)', placeholder: 'z. B. 38' },
  { key: 'brand', text: 'brand', label: 'Marke' },
];

const SPORT_FIELDS: CategoryField[] = [
  { key: 'size', text: 'sportSize', label: 'Größe / Länge', placeholder: 'z. B. 160 cm' },
  { key: 'brand', text: 'brand', label: 'Marke' },
];

const ELECTRONICS_FIELDS: CategoryField[] = [
  { key: 'brand', text: 'brand', label: 'Marke' },
  { key: 'model', text: 'model', label: 'Modell' },
];

/**
 * Category names are free text (admins create e.g. "Trekkingräder" or "E-Bikes / Pedelecs"),
 * so fields are matched by keywords. The first matching rule wins.
 */
const FIELD_RULES: { match: RegExp; exclude?: RegExp; fields: CategoryField[] }[] = [
  {
    // "rad" only as a whole word or word ending, so "Radio" does not count as a bike
    match: /fahrr|räder|\brad\b|rad$|bike|pedelec|\bmtb\b|bmx/i,
    // Accessories and clothing for cyclists have no frame number
    exclude: /zubehör|teile|bekleidung|helm|anhänger|schloss/i,
    fields: BIKE_FIELDS,
  },
  { match: /schuh|stiefel|sneaker/i, fields: SHOE_FIELDS },
  // "mode" only as a word or word ending ("Damenmode"), not in "Sondermodelle"
  { match: /kleid|jacke|hose|\bmode\b|mode$|shirt|pullover/i, fields: CLOTHING_FIELDS },
  { match: /sport|\bski|snowboard/i, fields: SPORT_FIELDS },
  {
    match: /elektron|handy|smartphone|computer|laptop|tablet|kamera|konsole/i,
    fields: ELECTRONICS_FIELDS,
  },
];

/**
 * Fields an organizer can make required for a bazaar, one per key. The same key means
 * the same thing in every category (e.g. "brand"), so one choice covers all of them.
 */
export const REQUIRABLE_FIELDS: CategoryField[] = (() => {
  const byKey = new Map<string, CategoryField>();
  for (const rule of FIELD_RULES) {
    for (const field of rule.fields) if (!byKey.has(field.key)) byKey.set(field.key, field);
  }
  return [...byKey.values()];
})();

export const REQUIRABLE_FIELD_KEYS = REQUIRABLE_FIELDS.map((field) => field.key);

/** Fields for a single category label, without looking at parent categories. */
export function getFieldsForLabel(label: string): CategoryField[] | undefined {
  const name = label.trim();
  return FIELD_RULES.find((rule) => rule.match.test(name) && !rule.exclude?.test(name))?.fields;
}

type CategoryLike = { _id: string; label: string; parentCategory?: string };

/**
 * Fields for a category. Sub-categories without their own set inherit the fields
 * of their parent.
 */
export function getCategoryFields(
  categoryId: string | undefined,
  categories: CategoryLike[] | undefined
): CategoryField[] {
  if (!categoryId || !categories) return [];
  const byId = new Map(categories.map((c) => [c._id, c]));
  const seen = new Set<string>();
  let current = byId.get(categoryId);
  while (current && !seen.has(current._id)) {
    seen.add(current._id);
    const fields = getFieldsForLabel(current.label);
    if (fields) return fields;
    current = current.parentCategory ? byId.get(current.parentCategory) : undefined;
  }
  return [];
}

/**
 * Keeps only the fields of the given category, trims values and drops empty ones.
 * Returns undefined when nothing is left, so the product stays without attributes.
 */
export function sanitizeAttributes(
  fields: CategoryField[],
  attributes: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!attributes) return undefined;
  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = attributes[field.key]?.trim();
    if (value) result[field.key] = value.slice(0, MAX_VALUE_LENGTH);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Label/value pairs for display, in the order the category defines. */
export function describeAttributes(
  fields: CategoryField[],
  attributes: Record<string, string> | undefined
): { label: string; text: CategoryFieldText; value: string }[] {
  if (!attributes) return [];
  return fields
    .filter((field) => attributes[field.key])
    .map((field) => ({ label: field.label, text: field.text, value: attributes[field.key] }));
}
