import { z } from 'zod';
import i18n from '../i18n';

/**
 * Form fields for category attributes and price negotiation, shared by the seller's
 * product form and the organizer's walk-in item dialog.
 */
export function productExtrasFields() {
  return {
    attributes: z.record(z.string(), z.string()).optional(),
    acceptsOffers: z.boolean(),
    minimumPrice: z
      .number()
      .min(0, i18n.t('form.minimumNegative', { ns: 'seller' }))
      .optional()
      .or(z.nan()),
  };
}

export function isMinimumPriceBelowPrice(data: { price: number; minimumPrice?: number }) {
  return (
    data.minimumPrice === undefined ||
    Number.isNaN(data.minimumPrice) ||
    data.minimumPrice < data.price
  );
}

export function minimumPriceError() {
  return {
    message: i18n.t('form.minimumAbovePrice', { ns: 'seller' }),
    path: ['minimumPrice'],
  };
}

export interface ProductExtrasFormData {
  attributes?: Record<string, string>;
  acceptsOffers: boolean;
  minimumPrice?: number;
}

/** Converts the form values into the mutation arguments. */
export function productExtrasPayload(data: ProductExtrasFormData) {
  return {
    attributes: data.attributes,
    acceptsOffers: data.acceptsOffers,
    minimumPrice:
      data.minimumPrice === undefined || Number.isNaN(data.minimumPrice)
        ? undefined
        : data.minimumPrice,
  };
}

/** Form defaults for an existing product (or a new one when called without). */
export function productExtrasDefaults(product?: {
  attributes?: Record<string, string>;
  acceptsOffers?: boolean;
  minimumPrice?: number;
}): ProductExtrasFormData {
  return {
    attributes: product?.attributes ?? {},
    acceptsOffers: product?.acceptsOffers ?? false,
    minimumPrice: product?.minimumPrice,
  };
}
