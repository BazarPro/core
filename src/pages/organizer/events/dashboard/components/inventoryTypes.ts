import type { Doc, Id } from '../../../../../../convex/_generated/dataModel';
import type { PurchasePriceSource } from '../../../../../../convex/constants';

export type ProductWithStatus = Doc<'products'> & {
  eventProductId: Id<'eventProducts'>;
  status: string;
  discountPercent?: number;
  locationCategoryId?: Id<'eventLocationCategories'>;
  locationLabel?: string;
  internalNote?: string;
  moderation?: { reason: string };
  /** What the buyer paid (sold items); differs from the label after offers or VB. */
  salePrice?: number;
  salePriceSource?: PurchasePriceSource;
};

export interface EventProductDetails {
  _id: Id<'eventProducts'>;
  eventId: Id<'events'>;
  productId: Id<'products'>;
  status: string;
  product: Doc<'products'>;
  vendor: Doc<'users'> | null;
  discountPercent?: number;
  locationCategoryId?: Id<'eventLocationCategories'>;
  locationLabel?: string;
}

export type ScanResult =
  | { type: 'product'; data: EventProductDetails }
  | {
      type: 'user';
      data: {
        user: Doc<'users'>;
        products: ProductWithStatus[];
        isRegisteredInEvent: boolean;
      };
    };
