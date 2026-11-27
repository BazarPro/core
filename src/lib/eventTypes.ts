import type { ItemKind } from '../components/illustrations/ItemIllustrations';
import type { StoredEventFeatures } from '../shared/eventFeatures';
import { compactSelection, groupCategories } from '../shared/categoryTree';

/**
 * Kinds of bazaars with suggested settings for the creation wizard, the most asked for
 * first. They only fill the form; the organizer can change everything afterwards.
 * Texts: organizer.eventTypes.<id> (title, text, highlights, example item and title).
 */
export type EventTypeId = 'kidsBazaar' | 'clothingBazaar' | 'skiBazaar' | 'bikeExchange';

/**
 * The worked example of the conditions (#303): what a typical seller hands in and sells.
 * `noun` names the items in it (events: conditions.exampleItems.<noun>).
 */
export interface FeeExampleCase {
  handedIn: number;
  sold: number;
  price: number;
  noun: 'item' | 'piece' | 'bike';
}

/** For a bazaar of no known kind */
export const NEUTRAL_FEE_EXAMPLE: FeeExampleCase = {
  handedIn: 5,
  sold: 3,
  price: 20,
  noun: 'item',
};

export interface EventType {
  id: EventTypeId;
  /** Drawing for the picker and the previews of the wizard */
  item: ItemKind;
  /** Prices of the example items in the previews (titles: eventTypes.<id>.exampleItems) */
  examplePrices: [number, number, number];
  /** What sellers of such a bazaar typically hand in and sell, for the worked example */
  feeExample: FeeExampleCase;
  commission: number;
  features: StoredEventFeatures;
  /**
   * Categories preselected by name, e.g. all bike categories. A main category that matches
   * brings its sub-categories along.
   */
  categoryMatch?: RegExp;
  /** Not preselected, even below a main category that matches, e.g. women's clothes */
  categoryExclude?: RegExp;
}

const BIKES = /fahrr|räder|\brad\b|rad$|bike|pedelec|\bmtb\b|bmx/i;
/** Ridden by children, sold at children's bazaars and at bike sales */
const KIDS_VEHICLES = /kinderfahrz|laufr|roller|scooter|einr[aä]d|bobby|rutsch/i;

export const EVENT_TYPES: EventType[] = [
  {
    // Many small items per seller: small labels, no photos needed, discounts at the end
    id: 'kidsBazaar',
    item: 'kids',
    feeExample: { handedIn: 10, sold: 6, price: 5, noun: 'piece' },
    examplePrices: [9, 15, 6],
    commission: 15,
    features: {
      discounts: true,
      maxDiscountPercent: 50,
      priceOffers: false,
      minimumPrice: false,
      questions: false,
      photosOptional: true,
      maxItemsPerSeller: 50,
      labelFormat: 'small',
      // Many small items: sorted back by sight, and the labels work at the next bazaar
      labelMark: 'universal',
      priceOnLabel: true,
    },
    categoryMatch: new RegExp(`kind|baby|spiel|kleid|schuh|b[uü]ch|${KIDS_VEHICLES.source}`, 'i'),
    categoryExclude: /damen|herren|roman|sachb|kochb|comic|video|konsole/i,
  },
  {
    // Second-hand for everyone, e.g. a women's clothing bazaar or a flea market
    id: 'clothingBazaar',
    item: 'clothing',
    feeExample: { handedIn: 8, sold: 5, price: 12, noun: 'piece' },
    examplePrices: [35, 24, 28],
    commission: 10,
    features: {
      discounts: true,
      maxDiscountPercent: 30,
      priceOffers: true,
      minimumPrice: false,
      questions: true,
      photosOptional: true,
      maxItemsPerSeller: 30,
      labelFormat: 'small',
      // Many small items: sorted back by sight, and the labels work at the next bazaar
      labelMark: 'universal',
      priceOnLabel: true,
    },
    categoryMatch: /kleid|schuh|accessoir|haushalt|b[uü]ch|spiel/i,
  },
  {
    // Fewer, pricier items: a negotiable price and questions about size and condition
    id: 'skiBazaar',
    item: 'ski',
    feeExample: { handedIn: 3, sold: 2, price: 60, noun: 'item' },
    examplePrices: [90, 45, 25],
    commission: 10,
    features: {
      discounts: false,
      priceOffers: true,
      minimumPrice: true,
      questions: true,
      photosOptional: true,
      maxItemsPerSeller: 15,
      labelFormat: 'standard',
      priceOnLabel: true,
    },
    categoryMatch: /ski|snowboard|winter|sport|schuh/i,
  },
  {
    // Classic bike exchange as in the guide "Fahrradbörse organisieren" of the docs: bikes
    // are handed in, sold at a cash desk, paid out after. A record for the police is the
    // same plus private sellers only, fixed data and a limit, switched on by the organizer.
    id: 'bikeExchange',
    item: 'bike',
    feeExample: { handedIn: 2, sold: 1, price: 150, noun: 'bike' },
    examplePrices: [140, 65, 25],
    commission: 10,
    features: {
      discounts: false,
      priceOffers: true,
      minimumPrice: true,
      questions: true,
      photosOptional: false,
      // Against suspicion of theft, and it belongs on the purchase contract
      requiredFields: ['frameNumber'],
      // Charged for every accepted bike, sold or not, like in the guide
      intakeFee: 3,
      labelFormat: 'standard',
      priceOnLabel: true,
    },
    categoryMatch: new RegExp(`${BIKES.source}|${KIDS_VEHICLES.source}`, 'i'),
    // Pushed, not ridden
    categoryExclude: /kinderwagen|buggy/i,
  },
];

/** The type of a draft or of the picker; drafts from before may name a removed one. */
export function findEventType(id: string | undefined): EventType | undefined {
  return EVENT_TYPES.find((type) => type.id === id);
}

/** The worked example for a kind of bazaar (`features.eventType`); neutral without one. */
export function feeExampleFor(eventType: string | undefined): FeeExampleCase {
  return findEventType(eventType)?.feeExample ?? NEUTRAL_FEE_EXAMPLE;
}

/**
 * The categories a kind of bazaar preselects, as a bazaar stores them: the sub-categories
 * whose name or main category matches, unless the kind excludes them; a main category
 * when all of its are in (compactSelection).
 */
export function preselectedCategories(
  type: Pick<EventType, 'categoryMatch' | 'categoryExclude'>,
  categories: readonly { _id: string; label: string; parentCategory?: string }[]
): string[] {
  const { categoryMatch: match, categoryExclude: exclude } = type;
  if (!match) return [];
  const chosen = new Set<string>();
  for (const { category, children } of groupCategories(categories)) {
    if (children.length === 0) {
      if (match.test(category.label) && !exclude?.test(category.label)) chosen.add(category._id);
      continue;
    }
    for (const child of children) {
      if (exclude?.test(child.label)) continue;
      if (match.test(child.label) || match.test(category.label)) chosen.add(child._id);
    }
  }
  return compactSelection(chosen, categories);
}
