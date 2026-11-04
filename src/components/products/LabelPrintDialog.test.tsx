import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Doc, Id } from '../../lib/api/types';
import { downloadLabelsPdf } from '../../lib/productQRCodePdf';
import { LabelPrintDialog } from './LabelPrintDialog';

const client = vi.hoisted(() => ({}));
const clashes = vi.hoisted(() => ({ value: undefined as string[] | undefined }));
vi.mock('../../lib/api/react', () => ({
  useApiClient: () => client,
  useQuery: (_fn: unknown, args: unknown) =>
    args !== 'skip' && (args as { eventIds?: string[] }).eventIds ? clashes.value : undefined,
}));
vi.mock('../../lib/productQRCodePdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/productQRCodePdf')>()),
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

  it('tells the seller when the labels of a bazaar can be reused', async () => {
    const reusable = {
      ...events[0],
      features: { labelFormat: 'small', labelMark: 'universal' },
    } as unknown as Doc<'events'>;
    render(
      <LabelPrintDialog
        open
        onOpenChange={() => {}}
        events={[reusable]}
        products={products}
        eventId="later"
      />
    );
    expect(
      await screen.findByText(/jedem Basar mit Universal-Etiketten wiederverwenden/)
    ).toBeInTheDocument();
  });

  it('warns the seller when another seller has the same pattern at the bazaar', async () => {
    clashes.value = ['next'];
    renderDialog('next');
    expect(await screen.findByRole('alert')).toHaveTextContent('nur im Buchstaben');
    clashes.value = undefined;
  });

  it('prints given items with a start place, without choosing a bazaar', async () => {
    render(
      <LabelPrintDialog
        open
        onOpenChange={() => {}}
        selection={['p1' as Id<'products'>]}
        eventId="next"
      />
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Erstes freies Feld auf dem Bogen'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }));
    await waitFor(() => expect(downloadLabelsPdf).toHaveBeenCalledWith(client, ['p1'], 'next', 5));
  });

  it('starts on a free place of a partly used sheet (#238)', async () => {
    renderDialog('next');
    expect(await screen.findByText('42 Etiketten auf 2 A4-Seiten')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Erstes freies Feld auf dem Bogen'), {
      target: { value: '40' },
    });
    // One label left on the first sheet, 41 need two more
    expect(await screen.findByText('42 Etiketten auf 3 A4-Seiten')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }));
    await waitFor(() =>
      expect(downloadLabelsPdf).toHaveBeenCalledWith(client, expect.any(Array), 'next', 40)
    );
  });

  it('prints the unsold items of the chosen bazaar for that bazaar', async () => {
    renderDialog('later');
    expect(await screen.findByText('1 Etikett auf 1 A4-Seite')).toBeInTheDocument();
    expect(screen.getByText('Format Standard: 12 große Etiketten pro Seite')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }));
    await waitFor(() =>
      expect(downloadLabelsPdf).toHaveBeenCalledWith(client, ['p101'], 'later', 1)
    );
  });

  it('falls back to all available items without a bazaar', async () => {
    render(
      <LabelPrintDialog open onOpenChange={() => {}} events={[events[2]]} products={products} />
    );
    expect(await screen.findByText('43 Etiketten auf 4 A4-Seiten')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }));
    await waitFor(() =>
      expect(downloadLabelsPdf).toHaveBeenCalledWith(client, expect.any(Array), undefined, 1)
    );
    expect(vi.mocked(downloadLabelsPdf).mock.calls[0][1]).toHaveLength(43);
  });
});
