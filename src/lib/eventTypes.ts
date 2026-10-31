import type { ItemKind } from '../components/illustrations/ItemIllustrations';
import type { StoredEventFeatures } from '../shared/eventFeatures';

/**
 * Kinds of bazaars with suggested settings for the creation wizard, the most asked for
 * first. They only fill the form; the organizer can change everything afterwards.
 * Texts: organizer.eventTypes.<id> (title, text, highlights, example item and title).
 */
export type EventTypeId = 'kidsBazaar' | 'clothingBazaar' | 'skiBazaar' | 'bikeExchange';

export interface EventType {
  id: EventTypeId;
  /** Drawing for the picker and the previews of the wizard */
  item: ItemKind;
  /** Prices of the example items in the previews (titles: eventTypes.<id>.exampleItems) */
  examplePrices: [number, number, number];
  commission: number;
  features: StoredEventFeatures;
  /** Categories preselected by name, e.g. all bike categories */
  categoryMatch?: RegExp;
}

const BIKES = /fahrr|räder|\brad\b|rad$|bike|pedelec|\bmtb\b|bmx/i;

export const EVENT_TYPES: EventType[] = [
  {
    // Many small items per seller: small labels, no photos needed, discounts at the end
    id: 'kidsBazaar',
    item: 'kids',
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
      priceOnLabel: false,
    },
    categoryMatch: /kind|baby|spiel|kleid|schuh|buch/i,
  },
  {
    // Second-hand for everyone, e.g. a women's clothing bazaar or a flea market
    id: 'clothingBazaar',
    item: 'clothing',
    examplePrices: [35, 24, 18],
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
      priceOnLabel: false,
    },
    categoryMatch: /kleid|schuh|accessoir|haushalt|buch|spiel/i,
  },
  {
    // Fewer, pricier items: a negotiable price and questions about size and condition
    id: 'skiBazaar',
    item: 'ski',
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
    // Classic bike exchange: items are handed in, sold at a cash desk, paid out after
    id: 'bikeExchange',
    item: 'bike',
    examplePrices: [140, 65, 80],
    commission: 10,
    features: {
      discounts: false,
      priceOffers: true,
      minimumPrice: true,
      questions: true,
      photosOptional: false,
      labelFormat: 'standard',
      priceOnLabel: true,
    },
    categoryMatch: BIKES,
  },
];

/** The type of a draft or of the picker; drafts from before may name a removed one. */
export function findEventType(id: string | undefined): EventType | undefined {
  return EVENT_TYPES.find((type) => type.id === id);
}
