import type { Doc, Id } from '../../../../../../convex/_generated/dataModel';

export type ProductWithStatus = Doc<'products'> & {
  eventProductId: Id<'eventProducts'>;
  status: string;
  discountPercent?: number;
  locationCategoryId?: Id<'eventLocationCategories'>;
  locationLabel?: string;
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
