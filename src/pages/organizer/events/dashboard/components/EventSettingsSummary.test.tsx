import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Doc } from '../../../../../lib/api/types';
import { EventSettingsSummary } from './EventSettingsSummary';

vi.mock('../../../../../lib/api/react', () => ({ useQuery: () => undefined }));
vi.mock('../../../../../hooks/usePublicQuery', () => ({
  usePublicQuery: () => [{ key: 'size', label: 'Größe', labelEn: 'Size', requirable: true }],
}));

const HOUR = 60 * 60 * 1000;
const start = new Date('2026-12-05T09:00:00').getTime();

type SummaryEvent = Parameters<typeof EventSettingsSummary>[0]['event'];

/** A bazaar with every setting the summary can show switched on. */
const everything = {
  _id: 'event1',
  title: 'Kinderbasar',
  location: 'Bürgerhalle',
  startDate: start,
  endDate: start + 4 * HOUR,
  categories: [],
  categoryLabels: ['Kleidung', 'Spielzeug'],
  services: ['Cafeteria'],
  commission: 10,
  visibility: 'approved',
  accessCode: 'KITA26',
  vendorLimit: 80,
  sellerLogistics: {
    dropoffStart: start - 20 * HOUR,
    dropoffEnd: start - 18 * HOUR,
    pickupStart: start + 6 * HOUR,
  },
  features: {
    directSale: true,
    discounts: true,
    discountStartsAt: start + 2 * HOUR,
    maxDiscountPercent: 30,
    questions: true,
    questionsDuringEventOnly: true,
    registrationStartsAt: start - 30 * 24 * HOUR,
    registrationEndsAt: start - 2 * 24 * HOUR,
    allowedPostalCodes: { DE: ['89'] },
    privateSellersOnly: true,
    requiredFields: ['size'],
    maxItemsPerSeller: 40,
    maxItemsTotal: 2000,
    intakeFee: 0.5,
    maxFeesPerSeller: 15,
    feeGroups: [{ id: 'club', label: 'Vereinsmitglieder', commission: 5 }],
    labelFormat: 'small',
    priceOnLabel: true,
  },
} as unknown as SummaryEvent;

/** An old bazaar with nothing set beyond the defaults. */
const plain = {
  ...everything,
  services: [],
  visibility: 'public',
  accessCode: '',
  vendorLimit: undefined,
  sellerLogistics: undefined,
  features: { registrationOpen: false, labelMark: 'none' },
} as unknown as Doc<'events'> & { categoryLabels: string[] };

function rowOf(label: string) {
  return screen.getByText(label, { selector: 'dt' }).parentElement!;
}

describe('the settings summary, one tab at a time', () => {
  it('shows only the part of the open tab', () => {
    render(<EventSettingsSummary event={everything} section="fees" />);
    expect(within(rowOf('Provision')).getByText('10 %')).toBeInTheDocument();
    expect(screen.getByText('Annahmegebühr 0,50 € pro Artikel')).toBeInTheDocument();
    expect(screen.getByText('Höchstens 15,00 € Gebühren pro Verkäufer')).toBeInTheDocument();
    expect(screen.getByText(/Vereinsmitglieder/)).toBeInTheDocument();
    expect(screen.queryByText('Termin')).not.toBeInTheDocument();
    expect(screen.queryByText('Zugangscode')).not.toBeInTheDocument();
  });

  it('names how the bazaar sells, with the times of the discounts and questions', () => {
    render(<EventSettingsSummary event={everything} section="sale" />);
    expect(screen.getByText('Direktverkauf, die Kasse kassiert nur die Provision')).toBeVisible();
    expect(screen.getByText(/höchstens 30 %/)).toBeInTheDocument();
    expect(screen.getByText('erst während des Basars')).toBeInTheDocument();
  });

  it('lists categories, services, required fields, limits and labels with the items', () => {
    render(<EventSettingsSummary event={everything} section="items" />);
    expect(screen.getByText('Kleidung')).toBeInTheDocument();
    expect(within(rowOf('Services')).getByText('Cafeteria')).toBeInTheDocument();
    expect(screen.getByText('Pflichtangaben: Größe')).toBeInTheDocument();
    expect(screen.getByText('Höchstens 40 Artikel pro Verkäufer')).toBeInTheDocument();
    expect(screen.getByText('Höchstens 2000 Artikel insgesamt')).toBeInTheDocument();
    expect(screen.getByText('Kleine Etiketten (40 pro Seite)')).toBeInTheDocument();
  });

  it('shows who may join: link, code, limit, registration window and region', () => {
    render(<EventSettingsSummary event={everything} section="registration" />);
    expect(within(rowOf('Zugangscode')).getByText('KITA26')).toBeInTheDocument();
    expect(within(rowOf('Link zum Basar')).getByText(/\/public-events\/event1$/)).toBeVisible();
    expect(within(rowOf('Teilnehmerlimit')).getByText('80 Verkäufer')).toBeInTheDocument();
    expect(within(rowOf('Anmeldung')).getByText(/^ab .* bis .*Uhr$/)).toBeInTheDocument();
    expect(screen.getByText('Nur Privatverkäufer')).toBeInTheDocument();
  });

  it('calls drop-off and pickup set-up and tear-down when sellers sell themselves', () => {
    render(<EventSettingsSummary event={everything} section="logistics" />);
    expect(screen.getByText('Aufbau')).toBeInTheDocument();
    expect(within(rowOf('Abbau')).queryByText('Nicht angegeben')).not.toBeInTheDocument();
  });

  it('says what is not given for a bazaar with nothing set', () => {
    render(<EventSettingsSummary event={plain} />);
    expect(within(rowOf('Zugangscode')).getByText('Kein Code')).toBeInTheDocument();
    expect(within(rowOf('Teilnehmerlimit')).getByText('Unbegrenzt')).toBeInTheDocument();
    expect(within(rowOf('Anmeldung')).getByText('Geschlossen, nur mit Einladung')).toBeVisible();
    expect(within(rowOf('Abgabe')).getByText('Nicht angegeben')).toBeInTheDocument();
    expect(within(rowOf('Services')).getByText('Keine')).toBeInTheDocument();
    expect(screen.queryByText('Link zum Basar')).not.toBeInTheDocument();
  });
});
