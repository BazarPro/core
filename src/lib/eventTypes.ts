import type { LucideIcon } from 'lucide-react';
import { Baby, Bike, ShieldCheck, Store } from 'lucide-react';
import type { StoredEventFeatures } from '../shared/eventFeatures';

/**
 * Kinds of bazaars with suggested settings for the creation wizard. They only fill the
 * form; the organizer can change everything afterwards. Texts: organizer.eventTypes.<id>.
 */
export type EventTypeId = 'bikeExchange' | 'bikeMarketRecord' | 'kidsBazaar' | 'fleaMarket';

export interface EventType {
  id: EventTypeId;
  icon: LucideIcon;
  commission: number;
  features: StoredEventFeatures;
  /** Categories preselected by name, e.g. all bike categories */
  categoryMatch?: RegExp;
}

const BIKES = /fahrr|räder|\brad\b|rad$|bike|pedelec|\bmtb\b|bmx/i;

export const EVENT_TYPES: EventType[] = [
  {
    // Classic bike exchange: items are handed in, sold at a cash desk, paid out after
    id: 'bikeExchange',
    icon: Bike,
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
  {
    // Like the bike market of the KV Ulm: a record of who offered which bike, e.g. for the police
    id: 'bikeMarketRecord',
    icon: ShieldCheck,
    commission: 20,
    features: {
      discounts: false,
      priceOffers: false,
      minimumPrice: false,
      questions: true,
      questionsDuringEventOnly: true,
      photosOptional: true,
      requiredFields: ['frameNumber'],
      maxItemsPerSeller: 5,
      labelFormat: 'standard',
      priceOnLabel: true,
      privateSellersOnly: true,
      fixedSellerData: true,
    },
    categoryMatch: BIKES,
  },
  {
    // Many small items per seller: small labels, no photos needed, discounts at the end
    id: 'kidsBazaar',
    icon: Baby,
    commission: 15,
    features: {
      discounts: true,
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
    id: 'fleaMarket',
    icon: Store,
    commission: 10,
    features: {
      discounts: true,
      priceOffers: true,
      minimumPrice: false,
      questions: true,
      photosOptional: true,
      labelFormat: 'standard',
      priceOnLabel: false,
    },
  },
];
