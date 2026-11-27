import { jsPDF } from 'jspdf';
import type { SettlementExport, SettlementSale, SettlementSeller } from './api/types';
import { formatPrice } from './utils';
import i18n from '../i18n';
import { dateLocale } from '../i18n/format';
import { saveFile, savePdf } from './saveFile';
import { drawTable, fileSlug, toCsv } from './pdfTable';
import { sellerAddress, sellerName } from './proofOfOffersPdf';

/**
 * The settlement of a bazaar for the organizers' records (§ 147 AO, #173): the sellers
 * with totals and payout, and every sale. As PDF, and as two CSV tables.
 */

function text(key: string, values?: Record<string, unknown>): string {
  return i18n.t(`export.${key}` as never, { ns: 'organizer', ...values }) as string;
}

function formatDate(timestamp: number, withTime = false): string {
  return new Date(timestamp).toLocaleString(dateLocale(), {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  });
}

const number = (value: number | undefined) => (value !== undefined ? String(value) : '–');
const sum = <T>(rows: T[], get: (row: T) => number) => rows.reduce((a, row) => a + get(row), 0);

/**
 * The column of the fee cap at every event with a cap (#301), so its layout does not
 * change once the first seller gets fees back; a credit without a cap still shows.
 */
const capCredit = (seller: SettlementSeller) => seller.feeCapCredit ?? 0;
export const hasCapColumn = ({ event, sellers }: Pick<SettlementExport, 'event' | 'sellers'>) =>
  event.maxFeesPerSeller !== undefined || sellers.some((seller) => capCredit(seller) > 0);
/** Index of the fee cap column, right after the intake fee */
const CAP_COLUMN = 6;
function withCap(row: string[], cap: boolean, value: string): string[] {
  return cap ? [...row.slice(0, CAP_COLUMN), value, ...row.slice(CAP_COLUMN)] : row;
}

/** The bazaar has fee groups (#302): the CSV gets a column, the PDF names it with the seller */
export const hasGroupColumn = ({ event, sellers }: Pick<SettlementExport, 'event' | 'sellers'>) =>
  !!event.feeGroups || sellers.some((seller) => seller.feeGroup);

export function sellerHeaders(cap = false, group = false): string[] {
  const headers = withCap(
    [
      text('number'),
      text('seller'),
      text('address'),
      text('revenue'),
      text('commission'),
      text('intakeFee'),
      text('payout'),
      text('paid'),
    ],
    cap,
    text('feeCap')
  );
  return group ? [...headers, text('feeGroup')] : headers;
}

/**
 * `group`: "column" adds the fee group as last column, "name" after the seller's name
 * (the PDF, whose columns are fixed).
 */
export function sellerRows(
  sellers: SettlementSeller[],
  cap = false,
  group: 'column' | 'name' | false = false
): string[][] {
  return sellers.map((seller) => {
    const name = sellerName(seller);
    const row = withCap(
      [
        number(seller.sellerNumber),
        group === 'name' && seller.feeGroup ? `${name} (${seller.feeGroup})` : name,
        sellerAddress(seller),
        formatPrice(seller.revenue),
        formatPrice(seller.commission),
        formatPrice(seller.intakeFee),
        formatPrice(seller.payout),
        seller.paid ? text('yes') : text('no'),
      ],
      cap,
      formatPrice(capCredit(seller))
    );
    return group === 'column' ? [...row, seller.feeGroup ?? ''] : row;
  });
}

function sellerTotals(sellers: SettlementSeller[], cap: boolean): string[] {
  return withCap(
    [
      '',
      text('total'),
      '',
      formatPrice(sum(sellers, (s) => s.revenue)),
      formatPrice(sum(sellers, (s) => s.commission)),
      formatPrice(sum(sellers, (s) => s.intakeFee)),
      formatPrice(sum(sellers, (s) => s.payout)),
      '',
    ],
    cap,
    formatPrice(sum(sellers, capCredit))
  );
}

export function saleHeaders(): string[] {
  return [
    text('soldAt'),
    text('number'),
    text('item'),
    text('category'),
    text('listPrice'),
    text('salePrice'),
    text('priceSource'),
    text('commission'),
    text('payout'),
  ];
}

export function saleRows(sales: SettlementSale[]): string[][] {
  return sales.map((sale) => [
    formatDate(sale.soldAt, true),
    number(sale.sellerNumber),
    sale.title,
    sale.category,
    formatPrice(sale.listPrice),
    formatPrice(sale.totalAmount),
    // A direct sale was paid to the seller; the payout of 0 € is no omission
    sale.directSale
      ? `${text(`source.${sale.priceSource}`)}, ${text('direct')}`
      : text(`source.${sale.priceSource}`),
    formatPrice(sale.commission),
    formatPrice(sale.payout),
  ]);
}

function saleTotals(sales: SettlementSale[]): string[] {
  return [
    text('total'),
    '',
    '',
    '',
    formatPrice(sum(sales, (s) => s.listPrice)),
    formatPrice(sum(sales, (s) => s.totalAmount)),
    '',
    formatPrice(sum(sales, (s) => s.commission)),
    formatPrice(sum(sales, (s) => s.payout)),
  ];
}

/** Column widths in mm on A4 landscape (297 mm minus margins). */
const SELLER_COLUMNS = [12, 50, 90, 25, 25, 28, 25, 22];
/** With the fee cap column the address makes room */
const SELLER_COLUMNS_CAP = [12, 50, 65, 25, 25, 28, 25, 25, 22];
const SALE_COLUMNS = [32, 12, 70, 45, 22, 24, 24, 22, 26];
const MARGIN = 10;

export function buildSettlementPdf(settlement: SettlementExport): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { event, sellers, sales } = settlement;

  doc.setFontSize(14);
  doc.text(text('title', { event: event.title }), MARGIN, 14);
  doc.setFontSize(9);
  doc.text(
    text('subtitle', {
      location: event.location,
      date: formatDate(event.startDate),
      commission: formatPrice(event.commission, 0),
      created: formatDate(Date.now(), true),
    }),
    MARGIN,
    20
  );

  const section = (title: string, y: number) => {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, MARGIN, y + 5);
    doc.setFontSize(8);
    return y + 8;
  };

  let y = section(text('sellers', { count: sellers.length }), 26);
  const cap = hasCapColumn(settlement);
  y = drawTable(doc, {
    columns: cap ? SELLER_COLUMNS_CAP : SELLER_COLUMNS,
    headers: sellerHeaders(cap),
    rows: [
      ...sellerRows(sellers, cap, hasGroupColumn(settlement) && 'name'),
      sellerTotals(sellers, cap),
    ],
    y,
    margin: MARGIN,
  });
  y = section(text('sales', { count: sales.length }), y + 6);
  drawTable(doc, {
    columns: SALE_COLUMNS,
    headers: saleHeaders(),
    rows: [...saleRows(sales), saleTotals(sales)],
    y,
    margin: MARGIN,
  });
  return doc;
}

export function downloadSettlementPdf(settlement: SettlementExport) {
  return savePdf(buildSettlementPdf(settlement), `${fileName(settlement, 'fileName')}.pdf`);
}

export function sellersCsv(settlement: SettlementExport): string {
  const cap = hasCapColumn(settlement);
  const group = hasGroupColumn(settlement);
  return toCsv([
    sellerHeaders(cap, group),
    ...sellerRows(settlement.sellers, cap, group && 'column'),
  ]);
}

export function salesCsv(settlement: SettlementExport): string {
  return toCsv([saleHeaders(), ...saleRows(settlement.sales)]);
}

export function downloadSettlementCsv(settlement: SettlementExport, table: 'sellers' | 'sales') {
  const csv = table === 'sellers' ? sellersCsv(settlement) : salesCsv(settlement);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const name = table === 'sellers' ? 'fileNameSellers' : 'fileNameSales';
  return saveFile(blob, `${fileName(settlement, name)}.csv`);
}

function fileName(settlement: SettlementExport, key: string): string {
  return fileSlug(text(key), settlement.event.title);
}
