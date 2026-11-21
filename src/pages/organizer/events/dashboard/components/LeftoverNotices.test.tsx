import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useMutation } from '../../../../../lib/api/react';
import type { Doc, Id } from '../../../../../lib/api/types';
import type { ProductWithStatus } from './inventoryTypes';
import { LeftoverNotices } from './LeftoverNotices';

vi.mock('../../../../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// The message dialog has its own tests
vi.mock('../../../../../components/broadcasts/BroadcastDialog', () => ({
  BroadcastDialog: ({ open, initialAudience }: { open: boolean; initialAudience: string }) =>
    open ? <div>Nachricht an {initialAudience}</div> : null,
}));

const EVENT = 'evt1' as Id<'events'>;
const HOUR = 3_600_000;
const NOW = Date.UTC(2027, 3, 10, 18);
const returnLeftovers = vi.fn();

const event = (over: Partial<Doc<'events'>> = {}) =>
  ({ _id: EVENT, endDate: NOW - HOUR, startDate: NOW - 8 * HOUR, ...over }) as Doc<'events'>;

const item = (id: string, vendor: string, status: string, auto = false) =>
  ({
    _id: id,
    vendorId: vendor,
    status,
    title: id,
    ...(auto ? { autoReturnedAt: NOW - HOUR } : {}),
  }) as unknown as ProductWithStatus;

const PRODUCTS = [
  item('rad', 'anna', 'available'),
  item('helm', 'anna', 'available'),
  item('schloss', 'ben', 'available'),
  item('ski', 'ben', 'sold'),
  item('mütze', 'cleo', 'announced'),
  // Cleo is paid out: her settlement is done
  item('jacke', 'cleo', 'available'),
];

function renderNotices(props: Partial<Parameters<typeof LeftoverNotices>[0]> = {}) {
  const callbacks = { onShowLeftovers: vi.fn(), onShowAutoReturned: vi.fn() };
  render(
    <LeftoverNotices
      eventId={EVENT}
      event={event()}
      products={PRODUCTS}
      isVendorPaid={(id) => id === 'cleo'}
      canReturn
      canMessage
      undoEnabled={false}
      now={NOW}
      {...callbacks}
      {...props}
    />
  );
  return callbacks;
}

beforeEach(() => {
  localStorage.clear();
  returnLeftovers.mockReset().mockResolvedValue({ returnedCount: 3, sellerCount: 2 });
  vi.mocked(useMutation).mockReturnValue(
    returnLeftovers as unknown as ReturnType<typeof useMutation>
  );
});

describe('LeftoverNotices (#305)', () => {
  it('previews what is left and returns it after asking', async () => {
    const { onShowLeftovers } = renderNotices();
    expect(
      screen.getByText(
        'Der Basar ist vorbei: 3 Artikel von 2 Verkäufern sind noch nicht zurückgegeben.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/in der kommenden Nacht automatisch/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Anzeigen' }));
    expect(onShowLeftovers).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Alle übrigen zurückgeben' }));
    expect(screen.getByText('3 übrige Artikel als zurückgegeben markieren?')).toBeInTheDocument();
    expect(screen.getByText(/geht zurück an 2 Verkäufern/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zurückgeben' }));
    await waitFor(() =>
      expect(returnLeftovers).toHaveBeenCalledWith({
        eventId: EVENT,
        productIds: ['rad', 'helm', 'schloss'],
      })
    );
    expect(toast.success).toHaveBeenCalledWith('3 Artikel zurückgegeben');
  });

  it('waits for the end of the pickup', () => {
    renderNotices({
      event: event({ sellerLogistics: { pickupEnd: NOW + 2 * HOUR } }),
    });
    expect(screen.getByText(/bis zum Ende der Abholung/)).toBeInTheDocument();
  });

  it('says that the automatic return is off', () => {
    renderNotices({ event: event({ features: { autoReturn: false } }) });
    expect(
      screen.getByText(/automatische Rückgabe ist für diesen Basar ausgeschaltet/)
    ).toBeInTheDocument();
  });

  it('shows nothing while the bazaar runs', () => {
    renderNotices({ event: event({ endDate: NOW + HOUR }) });
    expect(screen.queryByTestId('leftovers-notice')).not.toBeInTheDocument();
  });

  it('leaves out the button without the return right', () => {
    renderNotices({ canReturn: false });
    expect(screen.getByTestId('leftovers-notice')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Alle übrigen zurückgeben' })
    ).not.toBeInTheDocument();
  });

  it('after the cron: shows what it returned, to clear up with the sellers', () => {
    const { onShowAutoReturned } = renderNotices({
      event: event({ leftoversReturnedAt: NOW - HOUR }),
      products: [item('rad', 'anna', 'returned', true), item('ski', 'ben', 'sold')],
    });
    expect(screen.queryByTestId('leftovers-notice')).not.toBeInTheDocument();
    expect(
      screen.getByText('1 Artikel wurde in der Nacht nach dem Basar automatisch zurückgegeben.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Anzeigen' }));
    expect(onShowAutoReturned).toHaveBeenCalled();
    // "noch abzuholen" still reaches their sellers
    fireEvent.click(screen.getByRole('button', { name: 'Verkäufer anschreiben' }));
    expect(screen.getByText('Nachricht an pickup')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hinweis ausblenden' }));
    expect(screen.queryByTestId('auto-returned-notice')).not.toBeInTheDocument();
  });
});
