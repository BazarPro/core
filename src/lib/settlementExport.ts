import { jsPDF } from 'jspdf';
import type { SettlementExport, SettlementSale, SettlementSeller } from './api/types';
import { formatPriceDE } from './utils';
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

export function sellerHeaders(): string[] {
  return [
    text('number'),
    text('seller'),
    text('address'),
    text('revenue'),
    text('commission'),
    text('intakeFee'),
    text('payout'),
    text('paid'),
  ];
}

export function sellerRows(sellers: SettlementSeller[]): string[][] {
  return sellers.map((seller) => [
    number(seller.sellerNumber),
    sellerName(seller),
    sellerAddress(seller),
    formatPriceDE(seller.revenue),
    formatPriceDE(seller.commission),
    formatPriceDE(seller.intakeFee),
    formatPriceDE(seller.payout),
    seller.paid ? text('yes') : text('no'),
  ]);
}

function sellerTotals(sellers: SettlementSeller[]): string[] {
  return [
    '',
    text('total'),
    '',
    formatPriceDE(sum(sellers, (s) => s.revenue)),
    formatPriceDE(sum(sellers, (s) => s.commission)),
    formatPriceDE(sum(sellers, (s) => s.intakeFee)),
    formatPriceDE(sum(sellers, (s) => s.payout)),
    '',
  ];
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
    formatPriceDE(sale.listPrice),
    formatPriceDE(sale.totalAmount),
    text(`source.${sale.priceSource}`),
    formatPriceDE(sale.commission),
    formatPriceDE(sale.payout),
  ]);
}

function saleTotals(sales: SettlementSale[]): string[] {
  return [
    text('total'),
    '',
    '',
    '',
    formatPriceDE(sum(sales, (s) => s.listPrice)),
    formatPriceDE(sum(sales, (s) => s.totalAmount)),
    '',
    formatPriceDE(sum(sales, (s) => s.commission)),
    formatPriceDE(sum(sales, (s) => s.payout)),
  ];
}

/** Column widths in mm on A4 landscape (297 mm minus margins). */
const SELLER_COLUMNS = [12, 50, 90, 25, 25, 28, 25, 22];
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
      commission: formatPriceDE(event.commission, 0),
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
  y = drawTable(doc, {
    columns: SELLER_COLUMNS,
    headers: sellerHeaders(),
    rows: [...sellerRows(sellers), sellerTotals(sellers)],
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
  return toCsv([sellerHeaders(), ...sellerRows(settlement.sellers)]);
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
