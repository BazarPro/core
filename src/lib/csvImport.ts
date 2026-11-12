/**
 * CSV import of the items of a walk-in seller, e.g. the stock list of a shop (#241).
 * Pure functions: read the file, guess what each column means, turn the rows into items.
 */
import { getCategoryFields, MAX_SIZE_LENGTH } from '../shared/categoryFields';
import { isPriceInRange, PRODUCT_CONDITIONS, type ProductContitions } from '../shared/constants';

/** What a column of the file holds; `description` may be chosen for several columns. */
export const IMPORT_TARGETS = [
  'title',
  'price',
  'category',
  'condition',
  'size',
  'description',
  'ignore',
] as const;
export type ImportTarget = (typeof IMPORT_TARGETS)[number];

/** Same limit as MAX_IMPORT_ITEMS in backend/src/modules/walk_in_sellers.rs */
export const MAX_IMPORT_ITEMS = 1000;

export type CsvTable = { header: string[]; rows: string[][] };

/**
 * The text of the file: UTF-8, or Windows-1252 as Excel saves "CSV" on German Windows.
 * A byte order mark is dropped.
 */
export function decodeCsv(bytes: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.replace(/^\uFEFF/, '');
}

/** The separator used most in the first line outside of quotes: `;`, `,` or tab. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const unquoted = firstLine.replace(/"[^"]*"/g, '');
  const counts = [';', ',', '\t'].map((d) => [d, unquoted.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ';';
}

/** Parses CSV with quoted fields ("a;b", "say ""hi"""); the first line is the header. */
export function parseCsv(text: string): CsvTable {
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => r.some((value) => value.trim() !== ''));
  const [header = [], ...rows] = nonEmpty;
  return { header: header.map((h) => h.trim()), rows };
}

const GUESSES: [RegExp, ImportTarget][] = [
  // Not "Artikelnummer" or "Artikel-ID"
  [
    /^(?!.*(nr|nummer|number|\bid\b)).*(artikel|titel|title|bezeichnung|^name$|produkt|item)/i,
    'title',
  ],
  [/preis|price|vk|betrag/i, 'price'],
  [/kategorie|category|warengruppe/i, 'category'],
  [/zustand|condition/i, 'condition'],
  [/gr(ö|oe|o)(ß|ss)e|size|^gr\.?$/i, 'size'],
];

/**
 * A first guess of the column meanings from the header, e.g. "Groesse" → size; each
 * of title, price, category, condition and size goes to one column at most, the rest
 * becomes part of the description.
 */
export function guessTargets(header: string[]): ImportTarget[] {
  const taken = new Set<ImportTarget>();
  return header.map((name) => {
    const guess = GUESSES.find(([pattern, target]) => !taken.has(target) && pattern.test(name));
    if (guess) {
      taken.add(guess[1]);
      return guess[1];
    }
    return name.trim() ? 'description' : 'ignore';
  });
}

/** "145", "145,50", "1.234,50 €" or "12.5" in euros; undefined if it is no price. */
export function parsePrice(value: string): number | undefined {
  let text = value.replace(/[€\s]|EUR/gi, '');
  if (!text) return undefined;
  if (text.includes(',')) {
    // German: dots group the thousands, the comma separates the cents
    text = text.replace(/\./g, '').replace(',', '.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return undefined;
  return Number(text);
}

const CONDITION_WORDS: [RegExp, ProductContitions][] = [
  [/^(wie neu|sehr gut|neuwertig|like new|very good|very-good)$/i, 'very-good'],
  [/^(neu|new|ovp|neuware)$/i, 'new'],
  [/mängel|mangel|defekt|flaws|^ok$/i, 'ok'],
  [/^(gebraucht|gut|used|good)$/i, 'good'],
];

/** The condition of a cell, by key, by its title in the app or by usual words. */
export function parseCondition(
  value: string,
  titles: Record<ProductContitions, string>
): ProductContitions | undefined {
  const text = value.trim().toLowerCase();
  const exact = PRODUCT_CONDITIONS.find(
    (condition) => condition === text || titles[condition].toLowerCase() === text
  );
  return exact ?? CONDITION_WORDS.find(([pattern]) => pattern.test(text))?.[1];
}

export type ImportCategory = {
  _id: string;
  label: string;
  parentCategory?: string;
  translations?: { en?: string } | undefined;
};

export type ImportDefaults = {
  categoryId?: string;
  condition?: ProductContitions;
};

export type ImportItem = {
  title: string;
  description: string;
  condition: ProductContitions;
  productCategory: string;
  price: number;
  attributes?: Record<string, string>;
};

export type ImportProblem =
  | { code: 'titleTooShort' }
  | { code: 'priceMissing'; value: string }
  | { code: 'priceTooHigh' }
  | { code: 'categoryUnknown'; value: string }
  | { code: 'categoryMissing' }
  | { code: 'conditionUnknown'; value: string }
  | { code: 'conditionMissing' }
  | { code: 'sizeTooLong'; value: string; max: number };

export type ImportRow =
  | { line: number; item: ImportItem; problem?: undefined }
  | { line: number; item?: undefined; problem: ImportProblem };

/**
 * Turns the rows into items. A missing size or other extra field is no problem (#241);
 * a row that cannot become an item carries the reason. `line` counts the lines of the
 * file, the header is line 1.
 */
export function buildImportRows(
  table: CsvTable,
  targets: ImportTarget[],
  defaults: ImportDefaults,
  categories: ImportCategory[],
  conditionTitles: Record<ProductContitions, string>
): ImportRow[] {
  const byName = new Map<string, ImportCategory>();
  for (const category of categories) {
    for (const name of [category.label, category.translations?.en]) {
      const key = name?.trim().toLowerCase();
      if (key && !byName.has(key)) byName.set(key, category);
    }
  }
  const column = (target: ImportTarget) => targets.indexOf(target);
  const cell = (row: string[], target: ImportTarget) => {
    const index = column(target);
    return index >= 0 ? (row[index] ?? '').trim() : '';
  };

  return table.rows.map((row, index): ImportRow => {
    const line = index + 2;
    const fail = (problem: ImportProblem): ImportRow => ({ line, problem });

    const title = cell(row, 'title');
    if (title.length < 3) return fail({ code: 'titleTooShort' });

    const priceText = cell(row, 'price');
    const price = parsePrice(priceText);
    if (price === undefined) return fail({ code: 'priceMissing', value: priceText });
    if (!isPriceInRange(price)) return fail({ code: 'priceTooHigh' });

    const categoryText = cell(row, 'category');
    let categoryId = defaults.categoryId;
    if (categoryText) {
      const category = byName.get(categoryText.toLowerCase());
      if (!category) return fail({ code: 'categoryUnknown', value: categoryText });
      categoryId = category._id;
    }
    if (!categoryId) return fail({ code: 'categoryMissing' });

    const conditionText = cell(row, 'condition');
    let condition = defaults.condition;
    if (conditionText) {
      condition = parseCondition(conditionText, conditionTitles);
      if (!condition) return fail({ code: 'conditionUnknown', value: conditionText });
    }
    if (!condition) return fail({ code: 'conditionMissing' });

    const descriptionParts = targets.flatMap((target, i) => {
      const value = (row[i] ?? '').trim();
      if (target !== 'description' || !value) return [];
      return table.header[i] ? [`${table.header[i]}: ${value}`] : [value];
    });

    let attributes: Record<string, string> | undefined;
    const size = cell(row, 'size');
    if (size) {
      const hasSizeField = getCategoryFields(categoryId, categories).some((f) => f.key === 'size');
      if (hasSizeField) {
        if (size.length > MAX_SIZE_LENGTH) {
          return fail({ code: 'sizeTooLong', value: size, max: MAX_SIZE_LENGTH });
        }
        attributes = { size };
      } else {
        // The category has no size field: keep it in the description
        const sizeHeader = table.header[column('size')] || 'Größe';
        descriptionParts.unshift(`${sizeHeader}: ${size}`);
      }
    }

    return {
      line,
      item: {
        title,
        description: descriptionParts.join('\n'),
        condition,
        productCategory: categoryId,
        price,
        ...(attributes ? { attributes } : {}),
      },
    };
  });
}
