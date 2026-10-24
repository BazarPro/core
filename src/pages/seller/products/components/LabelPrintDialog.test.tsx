import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Doc, Id } from '../../../../lib/api/types';
import { downloadLabelsPdf } from '../../../../lib/productQRCodePdf';
import { LabelPrintDialog } from './LabelPrintDialog';

const client = vi.hoisted(() => ({}));
vi.mock('../../../../lib/api/react', () => ({ useApiClient: () => client }));
vi.mock('../../../../lib/productQRCodePdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/productQRCodePdf')>()),
  downloadLabelsPdf: vi.fn(async (_client: unknown, ids: unknown[]) => ids.length),
}));

const DAY = 24 * 3600 * 1000;
const event = (id: string, title: string, inDays: number, labelFormat?: 'small' | 'standard') =>
  ({
    _id: id,
    title,
    startDate: Date.now() + inDays * DAY,
    endDate: Date.now() + inDays * DAY + 6 * 3600 * 1000,
    features: labelFormat ? { labelFormat } : undefined,
  }) as unknown as Doc<'events'>;

const product = (n: number, eventIds: string[], sold = false) => ({
  _id: `p${n}` as Id<'products'>,
  eventIds,
  sold,
});

const events = [
  event('later', 'Fahrradbörse', 30),
  event('next', 'Kinderbasar Kita Sonnenschein', 3, 'small'),
  event('past', 'Herbstbasar', -10, 'small'),
];
// 42 unsold items at the children's bazaar: two sheets of 40 small labels
const products = [
  ...Array.from({ length: 42 }, (_, i) => product(i, ['next', 'past'])),
  product(100, ['next'], true),
  product(101, ['later']),
];

function renderDialog(eventId?: string) {
  render(
    <LabelPrintDialog
      open
      onOpenChange={() => {}}
      events={events}
      products={products}
      eventId={eventId}
    />
  );
}

describe('LabelPrintDialog', () => {
  beforeEach(() => {
    vi.mocked(downloadLabelsPdf).mockClear();
  });

  it('offers the next bazaar with its format and the number of sheets', async () => {
    renderDialog();
    expect(await screen.findByText('42 Etiketten auf 2 A4-Seiten')).toBeInTheDocument();
    expect(screen.getByText('Format Klein: 40 kleine Etiketten pro Seite')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Basar' })).toHaveTextContent(
      'Kinderbasar Kita Sonnenschein'
    );
  });

  it('prints the unsold items of the chosen bazaar for that bazaar', async () => {
    renderDialog('later');
    expect(await screen.findByText('1 Etikett auf 1 A4-Seite')).toBeInTheDocument();
    expect(screen.getByText('Format Standard: 12 große Etiketten pro Seite')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }));
    await waitFor(() => expect(downloadLabelsPdf).toHaveBeenCalledWith(client, ['p101'], 'later'));
  });

  it('falls back to all available items without a bazaar', async () => {
    render(
      <LabelPrintDialog open onOpenChange={() => {}} events={[events[2]]} products={products} />
    );
    expect(await screen.findByText('43 Etiketten auf 4 A4-Seiten')).toBeInTheDocument();
    expect(screen.getByText(/nach dem jeweils nächsten Basar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }));
    await waitFor(() =>
      expect(downloadLabelsPdf).toHaveBeenCalledWith(client, expect.any(Array), undefined)
    );
    expect(vi.mocked(downloadLabelsPdf).mock.calls[0][1]).toHaveLength(43);
  });
});
