import type { Doc, Id } from '../../../../../lib/api/types';
import type { SaleInfo } from '../../../../../lib/api/types';

export type ProductWithStatus = Doc<'products'> & {
  eventProductId: Id<'eventProducts'>;
  status: string;
  discountPercent?: number;
  locationCategoryId?: Id<'eventLocationCategories'>;
  locationLabel?: string;
  internalNote?: string;
  moderation?: { reason: string };
  /** Sold items: what the buyer paid and how the price came about. */
  sale?: SaleInfo;
};
