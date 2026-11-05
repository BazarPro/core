import { jsPDF } from 'jspdf';
import type { CategoryTranslations, VendorWithCalculations } from './api/types';
import { formatPriceDE } from './utils';
import { categoryFieldText } from '../i18n/categoryFields';
import { categoryName } from '../i18n/categories';
import i18n from '../i18n';
import { dateLocale } from '../i18n/format';
import { savePdf } from './saveFile';
import { drawTable, fileSlug } from './pdfTable';
import { sellerAddress, sellerName } from './proofOfOffersPdf';
import { describeAttributes, getCategoryFields } from '../shared/categoryFields';

/**
 * Printouts for one seller, above all for those without an account (#239, #240): the list
 * of their items, and the settlement with the same list to hand over at the payout.
 */

export type SellerPrintoutKind = 'items' | 'settlement';

export interface SellerPrintoutItem {
  title: string;
  price: number;
  status: 'announced' | 'available' | 'sold' | 'returned';
  productCategory: string;
  attributes?: Record<string, string>;
  sale?: { totalAmount: number };
}

export interface SellerPrintoutCategory {
  _id: string;
  label: string;
  parentCategory?: string;
  translations?: CategoryTranslations;
}

export interface SellerPrintout {
  event: { title: string; location: string; startDate: number; commission: number };
  seller: Pick<
    VendorWithCalculations,
    | 'name'
    | 'firstName'
    | 'lastName'
    | 'street'
    | 'zipCode'
    | 'city'
    | 'country'
    | 'sellerNumber'
    | 'totalRevenue'
    | 'commission'
    | 'intakeFee'
    | 'payout'
    | 'paid'
  >;
  items: SellerPrintoutItem[];
  categories?: SellerPrintoutCategory[];
}

const MARGIN = 10;
/** Column widths in mm on A4 portrait (210 mm minus margins). */
const ITEM_COLUMNS = [58, 32, 44, 18, 38];
const SUMMARY_COLUMNS = [150, 40];

function text(key: string, values?: Record<string, unknown>): string {
  return i18n.t(`printout.${key}` as never, { ns: 'organizer', ...values }) as string;
}

function settleText(key: string, values?: Record<string, unknown>): string {
  return i18n.t(`settle.${key}` as never, { ns: 'organizer', ...values }) as string;
}

function formatDate(timestamp: number, withTime = false): string {
  return new Date(timestamp).toLocaleString(dateLocale(), {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  });
}

function displayName(seller: SellerPrintout['seller']): string {
  const fromParts = sellerName(seller);
  return fromParts !== '–' ? fromParts : (seller.name ?? fromParts);
}

function statusText(item: SellerPrintoutItem): string {
  if (item.status !== 'sold') return text(`status.${item.status}`);
  return item.sale
    ? text('status.soldFor', { price: formatPriceDE(item.sale.totalAmount) })
    : text('status.sold');
}

export function itemHeaders(): string[] {
  return [text('item'), text('category'), text('details'), text('price'), text('state')];
}

export function itemRows(
  items: SellerPrintoutItem[],
  categories: SellerPrintoutCategory[] = []
): string[][] {
  const byId = new Map(categories.map((category) => [category._id, category]));
  return items.map((item) => {
    const category = byId.get(item.productCategory);
    const fields = getCategoryFields(item.productCategory, categories);
    const details = describeAttributes(fields, item.attributes)
      .map(
        (attribute) =>
          `${categoryFieldText(attribute, 'label') ?? attribute.label}: ${attribute.value}`
      )
      .join(' · ');
    return [
      item.title,
      category ? categoryName(category) : '–',
      details || '–',
      formatPriceDE(item.price),
      statusText(item),
    ];
  });
}

/** The same lines as on the settlement screen, without the final amount. */
export function settlementRows({ event, seller, items }: SellerPrintout): string[][] {
  const rows = [
    [
      settleText('sold', { count: items.filter((item) => item.status === 'sold').length }),
      `${formatPriceDE(seller.totalRevenue)} €`,
    ],
    [
      settleText('commission', { percent: event.commission }),
      `${seller.commission > 0 ? '-' : ''}${formatPriceDE(seller.commission)} €`,
    ],
  ];
  if (seller.intakeFee.total > 0) {
    rows.push([
      settleText('intakeFee', {
        items: seller.intakeFee.items,
        perItem: formatPriceDE(seller.intakeFee.perItem),
      }),
      `-${formatPriceDE(seller.intakeFee.total)} €`,
    ]);
  }
  return rows;
}

/** With an intake fee and few sales the seller pays the bazaar instead. */
export function settlementTotal({ seller }: SellerPrintout): string[] {
  const owes = seller.payout < -0.005;
  return [
    owes ? settleText('pays', { name: displayName(seller) }) : settleText('payout'),
    `${formatPriceDE(Math.abs(seller.payout))} €`,
  ];
}

export function buildSellerPrintoutPdf(kind: SellerPrintoutKind, printout: SellerPrintout): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { event, seller, items, categories } = printout;
  const width = SUMMARY_COLUMNS[0] + SUMMARY_COLUMNS[1];

  // Long titles and addresses wrap, what follows moves down with them
  let y = 14;
  const headerLine = (line: string, size: number, bold: boolean, gap: number) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(line, width) as string[];
    doc.text(lines, MARGIN, y);
    y += (lines.length - 1) * size * 0.45 + gap;
  };
  headerLine(text(`${kind}Title`, { event: event.title }), 14, true, 6);
  headerLine(
    text('subtitle', {
      location: event.location,
      date: formatDate(event.startDate),
      created: formatDate(Date.now(), true),
    }),
    9,
    false,
    8
  );
  const number = seller.sellerNumber !== undefined ? `${seller.sellerNumber} · ` : '';
  headerLine(`${number}${displayName(seller)}`, 11, true, 5);
  const address = sellerAddress(seller);
  if (address !== '–') headerLine(address, 9, false, 5);

  doc.setFontSize(8);
  if (kind === 'settlement') {
    y = drawTable(doc, {
      columns: SUMMARY_COLUMNS,
      headers: [text('settlement'), text('amount')],
      rows: settlementRows(printout),
      y,
      margin: MARGIN,
    });
    const [label, amount] = settlementTotal(printout);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(label, MARGIN + 1, y + 6);
    doc.text(amount, MARGIN + SUMMARY_COLUMNS[0] + 1, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(seller.paid ? text('settled') : text('notSettled'), MARGIN + 1, y + 11);
    y += 16;
    doc.setFontSize(8);
  }

  drawTable(doc, {
    columns: ITEM_COLUMNS,
    headers: itemHeaders(),
    rows: itemRows(items, categories),
    y,
    margin: MARGIN,
  });
  return doc;
}

export function downloadSellerPrintout(kind: SellerPrintoutKind, printout: SellerPrintout) {
  const name = fileSlug(text(`${kind}FileName`), displayName(printout.seller));
  return savePdf(buildSellerPrintoutPdf(kind, printout), `${name}.pdf`);
}
