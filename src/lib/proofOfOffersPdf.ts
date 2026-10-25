import { jsPDF } from 'jspdf';
import type { ProofItem, ProofSeller } from './api/types';
import { formatPriceDE } from './utils';
import { categoryFieldText } from '../i18n/categoryFields';
import i18n from '../i18n';
import { dateLocale } from '../i18n/format';
import { saveFile, savePdf } from './saveFile';
import { drawTable, fileSlug, toCsv } from './pdfTable';

/**
 * Record of who offered which item at a bazaar, e.g. for the police after a bike
 * market: one row per item with the seller's recorded details. As PDF and as CSV.
 */

export interface ProofOfOffers {
  event: { title: string; location: string; startDate: number; endDate: number };
  items: ProofItem[];
}

function text(key: string, values?: Record<string, unknown>): string {
  return i18n.t(`proof.${key}` as never, { ns: 'organizer', ...values }) as string;
}

function formatDate(timestamp: number, withTime = false): string {
  return new Date(timestamp).toLocaleString(dateLocale(), {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  });
}

export function sellerName(seller: Pick<ProofSeller, 'firstName' | 'lastName'>): string {
  return [seller.firstName, seller.lastName].filter(Boolean).join(' ') || '–';
}

export function sellerAddress(
  seller: Pick<ProofSeller, 'street' | 'zipCode' | 'city' | 'country'>
): string {
  const city = [seller.zipCode, seller.city].filter(Boolean).join(' ');
  return [seller.street, city, seller.country].filter(Boolean).join(', ') || '–';
}

function contact(seller: ProofSeller): string {
  return [seller.phone, seller.email].filter(Boolean).join(', ') || '–';
}

function details(item: ProofItem): string {
  const attributes = item.attributes.map(
    (attribute) => `${categoryFieldText(attribute, 'label') ?? attribute.label}: ${attribute.value}`
  );
  return [item.category, ...attributes].filter(Boolean).join(' · ');
}

function sale(item: ProofItem): string {
  if (item.soldFor === undefined) return text('notSold');
  return text('soldFor', {
    price: formatPriceDE(item.soldFor),
    date: item.soldAt !== undefined ? formatDate(item.soldAt, true) : '',
  });
}

/** The table rows as plain text, shared by PDF and CSV. */
export function proofRows(items: ProofItem[]): string[][] {
  return items.map((item) => [
    item.seller.sellerNumber !== undefined ? String(item.seller.sellerNumber) : '–',
    sellerName(item.seller),
    sellerAddress(item.seller),
    contact(item.seller),
    item.title,
    details(item),
    `${formatPriceDE(item.price)} €`,
    sale(item),
  ]);
}

function headers(): string[] {
  return [
    text('number'),
    text('seller'),
    text('address'),
    text('contact'),
    text('item'),
    text('details'),
    text('price'),
    text('sale'),
  ];
}

/** Column widths in mm on A4 landscape (297 mm minus margins). */
const COLUMNS = [12, 32, 46, 38, 38, 58, 20, 33];
const MARGIN = 10;

export function buildProofOfOffersPdf(proof: ProofOfOffers): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { event } = proof;

  doc.setFontSize(14);
  doc.text(text('title', { event: event.title }), MARGIN, 14);
  doc.setFontSize(9);
  doc.text(
    text('subtitle', {
      location: event.location,
      date: formatDate(event.startDate),
      created: formatDate(Date.now(), true),
      count: proof.items.length,
    }),
    MARGIN,
    20
  );

  doc.setFontSize(8);
  const y = drawTable(doc, {
    columns: COLUMNS,
    headers: headers(),
    rows: proofRows(proof.items),
    y: 28,
    margin: MARGIN,
  });
  if (proof.items.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.text(text('empty'), MARGIN, y + 6);
  }
  return doc;
}

export function downloadProofOfOffersPdf(proof: ProofOfOffers) {
  return savePdf(buildProofOfOffersPdf(proof), `${fileName(proof)}.pdf`);
}

export function proofOfOffersCsv(proof: ProofOfOffers): string {
  return toCsv([headers(), ...proofRows(proof.items)]);
}

export function downloadProofOfOffersCsv(proof: ProofOfOffers) {
  const blob = new Blob([proofOfOffersCsv(proof)], { type: 'text/csv;charset=utf-8' });
  return saveFile(blob, `${fileName(proof)}.csv`);
}

function fileName(proof: ProofOfOffers): string {
  return fileSlug(text('fileName'), proof.event.title);
}
