import type { Id } from '../../convex/_generated/dataModel';
import {
  missingForEvent,
  type MissingProductInfo,
  type StoredEventFeatures,
} from '../../convex/eventFeatures';

export interface CompletionProduct {
  _id: Id<'products'>;
  title: string;
  price: number;
  images: readonly unknown[];
  eventIds?: string[];
}

export interface CompletionEvent {
  _id: Id<'events'> | string;
  title: string;
  features?: StoredEventFeatures;
}

/** An item that lacks something before it can be announced for the given events. */
export interface ProductToComplete {
  product: CompletionProduct;
  missing: MissingProductInfo[];
  eventTitles: string[];
}

/**
 * The items that need more information before they can be announced for the target
 * events. Events an item is already announced for are not checked again.
 */
export function findProductsToComplete(
  products: CompletionProduct[],
  targetEvents: CompletionEvent[]
): ProductToComplete[] {
  const result: ProductToComplete[] = [];
  for (const product of products) {
    const missing = new Set<MissingProductInfo>();
    const eventTitles: string[] = [];
    for (const event of targetEvents) {
      if (product.eventIds?.includes(event._id)) continue;
      const missingHere = missingForEvent(product, event);
      if (missingHere.length === 0) continue;
      missingHere.forEach((info) => missing.add(info));
      eventTitles.push(event.title);
    }
    if (missing.size > 0) result.push({ product, missing: [...missing], eventTitles });
  }
  return result;
}
