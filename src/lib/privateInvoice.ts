import type { Id } from './api/types';
import { api } from './api/functions';
import type { SaleInfo } from './api/types';
import { downloadPrivateInvoicePdf, downloadPrivateInvoicesPdf } from './privateInvoicePdf';
import { buildPriceLines, type InvoiceCopy } from './saleBreakdown';
import { getStorageImageDataUrl } from './storageImage';

type QueryClient = {
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
  client: QueryClient;
  eventId: Id<'events'>;
  product: PrivateInvoiceProductInput;
  sale: SaleInfo;
  /** The buyer's copy, or the seller's with the bazaar fee deducted. */
  copy?: InvoiceCopy;
}

export async function downloadPrivateInvoiceForProduct({
  client,
  eventId,
  product,
  sale,
  copy = 'buyer',
}: DownloadPrivateInvoiceForProductParams): Promise<void> {
  const firstImageStorageId = product.images?.[0];
  const productImageDataUrl = await getStorageImageDataUrl(client, firstImageStorageId);
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

/** The buyer's invoice for everything sold at the cash desk in one go, one page per item. */
export async function downloadPrivateInvoicesForSale(
  client: QueryClient,
  items: { product: PrivateInvoiceProductInput; sale: SaleInfo }[]
): Promise<void> {
  const pages = await Promise.all(
    items.map(async ({ product, sale }) => ({
      productTitle: product.title,
      productDescription: product.description,
      price: sale.totalAmount,
      priceLines: buildPriceLines(sale, 'buyer'),
      copy: 'buyer' as const,
      // Without internet the invoice comes without pictures
      productImageDataUrl: await getStorageImageDataUrl(client, product.images?.[0]).catch(
        () => undefined
      ),
    }))
  );
  const name = items.length === 1 ? `-${items[0].product.title}` : '';
  await downloadPrivateInvoicesPdf(pages, `Privatrechnung-Kaeufer${name}`.replace(/\s+/g, '-'));
}
