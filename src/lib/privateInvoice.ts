import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { downloadPrivateInvoicePdf } from './privateInvoicePdf';
import { getStorageImageDataUrl } from './storageImage';
import { discountedPrice } from '../../convex/eventFeatures';

type ConvexQueryClient = {
  query: (
    query: typeof api.products.getImageUrls,
    args: { storageIds: Id<'_storage'>[] }
  ) => Promise<string[] | undefined>;
};

export interface PrivateInvoiceProductInput {
  images?: Id<'_storage'>[];
  title: string;
  description: string;
  price: number;
  discountPercent?: number;
}

/**
 * The price that goes on the receipt. An accepted offer or a price negotiated at the
 * cash desk replaces label price and discount; otherwise the discount is shown.
 */
export function invoicePriceFor(
  product: PrivateInvoiceProductInput & { salePrice?: number | null }
): PrivateInvoiceProductInput {
  const { salePrice, ...rest } = product;
  const listPrice = discountedPrice(rest.price, rest.discountPercent);
  if (salePrice === undefined || salePrice === null || Math.abs(salePrice - listPrice) < 0.005) {
    return rest;
  }
  return { ...rest, price: salePrice, discountPercent: undefined };
}

interface DownloadPrivateInvoiceForProductParams {
  convex: ConvexQueryClient;
  eventId: Id<'events'>;
  product: PrivateInvoiceProductInput;
}

export async function downloadPrivateInvoiceForProduct({
  convex,
  eventId,
  product,
}: DownloadPrivateInvoiceForProductParams): Promise<void> {
  const firstImageStorageId = product.images?.[0];
  const productImageDataUrl = await getStorageImageDataUrl(convex, firstImageStorageId);

  await downloadPrivateInvoicePdf({
    eventId,
    productTitle: product.title,
    productDescription: product.description,
    price: product.price,
    discountPercent: product.discountPercent,
    productImageDataUrl,
    fileName: `Privatrechnung-${product.title}-${eventId}`.replace(/\s+/g, '-'),
  });
}
