import type { Id } from '../../convex/_generated/dataModel';
import { api } from './api/functions';
import type { SaleInfo } from '../../convex/sales';
import { downloadPrivateInvoicePdf } from './privateInvoicePdf';
import { buildPriceLines, type InvoiceCopy } from './saleBreakdown';
import { getStorageImageDataUrl } from './storageImage';

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
}

interface DownloadPrivateInvoiceForProductParams {
  convex: ConvexQueryClient;
  eventId: Id<'events'>;
  product: PrivateInvoiceProductInput;
  sale: SaleInfo;
  /** The buyer's copy, or the seller's with the bazaar fee deducted. */
  copy?: InvoiceCopy;
}

export async function downloadPrivateInvoiceForProduct({
  convex,
  eventId,
  product,
  sale,
  copy = 'buyer',
}: DownloadPrivateInvoiceForProductParams): Promise<void> {
  const firstImageStorageId = product.images?.[0];
  const productImageDataUrl = await getStorageImageDataUrl(convex, firstImageStorageId);
  const suffix = copy === 'seller' ? 'Verkaeufer' : 'Kaeufer';

  await downloadPrivateInvoicePdf({
    eventId,
    productTitle: product.title,
    productDescription: product.description,
    price: sale.totalAmount,
    priceLines: buildPriceLines(sale, copy),
    copy,
    productImageDataUrl,
    fileName: `Privatrechnung-${suffix}-${product.title}`.replace(/\s+/g, '-'),
  });
}
