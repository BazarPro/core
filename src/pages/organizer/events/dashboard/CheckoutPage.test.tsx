import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnected, useMutation, useQuery } from '../../../../lib/api/react';
import { type FunctionReference } from '../../../../lib/api/types';
import { getFunctionName } from '../../../../lib/api/functions';
import { productIdFromCode } from '../../../../lib/checkout';
import { OFFLINE_FLAG_KEY, resetOfflineCheckout } from '../../../../lib/offlineCheckout';
import { CheckoutPage } from './CheckoutPage';

vi.mock('../../../../lib/api/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useConnected: vi.fn(() => true),
  useApiClient: vi.fn(() => apiClient),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../../../components/ui/image-with-fallback', () => ({
  ImageWithFallback: () => null,
}));
// The camera is replaced by buttons that "scan" a label
vi.mock('../../../../components/ui/QRCodeScanner', () => ({
  QRCodeScanner: ({ onScanSuccess }: { onScanSuccess: (code: string) => void }) => (
    <div>
      {['jacke0000000000000001', 'hose00000000000000002', 'buch00000000000000003'].map((id) => (
        <button key={id} onClick={() => onScanSuccess(`https://bazarpro.de/products/view/${id}`)}>
          scan {id.slice(0, 4)}
        </button>
      ))}
    </div>
  ),
}));

const ITEMS: Record<string, object> = {
  jacke0000000000000001: {
    eventProductId: 'ep1',
    title: 'Jacke',
    image: null,
    status: 'available',
    price: 12,
    discountPercent: 25,
    listPrice: 9,
    sellerPaidOut: false,
    attributes: [
      { label: 'Größe', value: '104' },
      { label: 'Farbe', value: 'Blau' },
    ],
    internalNote: 'Haken 12',
  },
  hose00000000000000002: {
    eventProductId: 'ep2',
    title: 'Hose',
    image: null,
    status: 'available',
    price: 6,
    listPrice: 6,
    minimumPrice: 4,
    sellerPaidOut: false,
    attributes: [],
  },
  buch00000000000000003: {
    eventProductId: 'ep3',
    title: 'Buch',
    image: null,
    status: 'sold',
    price: 2,
    listPrice: 2,
    sellerPaidOut: false,
    attributes: [],
  },
};

const sellProducts = vi.fn();
/** For the offline desk; vi.hoisted, as the mock of the api module uses it */
const apiClient = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  batchQuery: vi.fn(async () => []),
  isOnDevice: vi.fn(() => false),
  onAuthChange: vi.fn(() => () => {}),
}));
/** Stable like a real query result; a new array per render would loop */
const NO_OFFERS: never[] = [];

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/events/view/evt1/checkout']}>
      <Routes>
        <Route path="/events/view/:eventId/checkout" element={<CheckoutPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const scan = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: `scan ${name}` }));
const finish = () => screen.getByRole('button', { name: 'Verkauf abschließen' });

vi.mock('../../../../lib/checkout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/checkout')>();
  return {
    ...actual,
    playScanBeep: vi.fn(),
  };
});

describe('CheckoutPage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetOfflineCheckout();
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    sellProducts.mockReset().mockResolvedValue({ purchaseIds: ['p1', 'p2'], total: 14 });
    vi.mocked(useMutation).mockReturnValue(
      sellProducts as unknown as ReturnType<typeof useMutation>
    );
    vi.mocked(useQuery).mockImplementation(((query: unknown, args: unknown) => {
      if (args === 'skip') return undefined;
      const name = getFunctionName(query as FunctionReference<'query'>);
      if (name === 'purchases.getCheckoutItem') {
        return ITEMS[(args as { productId: string }).productId] ?? null;
      }
      return NO_OFFERS;
    }) as typeof useQuery);
  });

  it('shows every detail and the team note of a scanned item', () => {
    renderPage();
    scan('jack');
    const line = screen.getByTestId('checkout-line');
    expect(within(line).getByText('Größe: 104')).toBeInTheDocument();
    expect(within(line).getByText('Farbe: Blau')).toBeInTheDocument();
    expect(within(line).getByText('Haken 12')).toBeInTheDocument();
  });

  it('adds scanned items once, sums the current prices and sells them together', async () => {
    renderPage();
    scan('jack');
    scan('jack'); // the camera sees the same label again
    scan('hose');

    const lines = screen.getAllByTestId('checkout-line');
    expect(lines).toHaveLength(2);
    expect(within(lines[0]).getByText('Größe: 104')).toBeInTheDocument();
    expect(screen.getByText('15,00 €')).toBeInTheDocument();

    expect(finish()).toBeDisabled();
    fireEvent.click(screen.getByLabelText('15,00 € erhalten'));
    fireEvent.click(finish());

    await waitFor(() =>
      expect(sellProducts).toHaveBeenCalledWith({
        items: [{ eventProductId: 'ep1' }, { eventProductId: 'ep2' }],
        buyerEmail: undefined,
        deskSaleId: expect.any(String),
      })
    );
    expect(await screen.findByText('2 Artikel verkauft')).toBeInTheDocument();
    expect(screen.queryAllByTestId('checkout-line')).toHaveLength(0);
    expect(localStorage.getItem('bazarpro:checkout:cart:evt1')).toBeNull();
  });

  it('links scanned products to their product page', () => {
    renderPage();
    scan('jack');

    const line = screen.getByTestId('checkout-line');
    const links = within(line).getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(
      links.some((link) => link.getAttribute('href') === '/products/view/jacke0000000000000001')
    ).toBe(true);
  });

  it('plays a beep on scan when sound is enabled, and respects sound toggle', async () => {
    const { playScanBeep } = await import('../../../../lib/checkout');
    renderPage();
    expect(screen.getByRole('button', { name: 'Signalton ausschalten' })).toBeInTheDocument();

    scan('jack');
    expect(playScanBeep).toHaveBeenCalledTimes(1);

    // Toggle sound off
    fireEvent.click(screen.getByRole('button', { name: 'Signalton ausschalten' }));
    expect(screen.getByRole('button', { name: 'Signalton einschalten' })).toBeInTheDocument();

    scan('hose');
    // Still 1, did not beep when sound was off
    expect(playScanBeep).toHaveBeenCalledTimes(1);
  });

  it('persists scanned items in cache and reloads them on revisit', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/events/view/evt1/checkout']}>
        <Routes>
          <Route path="/events/view/:eventId/checkout" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>
    );

    scan('jack');
    scan('hose');
    expect(screen.getAllByTestId('checkout-line')).toHaveLength(2);

    // Leaving the page
    unmount();

    // Returning to the checkout page
    render(
      <MemoryRouter initialEntries={['/events/view/evt1/checkout']}>
        <Routes>
          <Route path="/events/view/:eventId/checkout" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>
    );

    const reloadedLines = screen.getAllByTestId('checkout-line');
    expect(reloadedLines).toHaveLength(2);
    expect(within(reloadedLines[0]).getByText('Jacke')).toBeInTheDocument();
    expect(within(reloadedLines[1]).getByText('Hose')).toBeInTheDocument();
  });

  it('clears cached cart when clicking Leeren', () => {
    renderPage();
    scan('jack');
    expect(screen.getAllByTestId('checkout-line')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Leeren' }));
    expect(screen.queryAllByTestId('checkout-line')).toHaveLength(0);
    expect(localStorage.getItem('bazarpro:checkout:cart:evt1')).toBeNull();
  });

  it('negotiated price within the minimum price only', async () => {
    renderPage();
    scan('hose');
    fireEvent.change(screen.getByRole('combobox', { name: 'Preis' }), {
      target: { value: 'negotiated' },
    });
    fireEvent.change(screen.getByLabelText('Verhandelter Preis'), { target: { value: '3' } });
    expect(screen.getByText(/Preis zwischen 4,00 € und 6,00 €/)).toBeInTheDocument();
    // An invalid price does not count: nothing to confirm yet
    expect(screen.getByLabelText('0,00 € erhalten')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Verhandelter Preis'), { target: { value: '4,5' } });
    fireEvent.click(screen.getByLabelText('4,50 € erhalten'));
    fireEvent.click(finish());
    await waitFor(() =>
      expect(sellProducts).toHaveBeenCalledWith({
        items: [{ eventProductId: 'ep2', negotiatedPrice: 4.5 }],
        buyerEmail: undefined,
        deskSaleId: expect.any(String),
      })
    );
  });

  it('a sold item blocks the sale until it is removed', () => {
    renderPage();
    scan('jack');
    scan('buch');
    expect(screen.getByText('Bereits verkauft.')).toBeInTheDocument();
    expect(screen.getByLabelText('9,00 € erhalten')).toBeDisabled();

    const buch = screen.getAllByTestId('checkout-line')[1];
    fireEvent.click(within(buch).getByRole('button', { name: 'Aus dem Warenkorb' }));
    expect(screen.getByLabelText('9,00 € erhalten')).toBeEnabled();
  });
});

describe('CheckoutPage without internet (app)', () => {
  // Nobody signed in: the files of no user (deviceFiles)
  const STORE = 'bazarpro:users:none:offline-checkout:evt1';
  const copy = {
    takenAt: new Date('2026-10-24T09:30:00').getTime(),
    items: [
      { ...ITEMS.jacke0000000000000001, productId: 'jacke0000000000000001', offers: [] },
      { ...ITEMS.buch00000000000000003, productId: 'buch00000000000000003', offers: [] },
    ],
  };
  const queue = () =>
    (JSON.parse(localStorage.getItem(STORE) ?? '{}') as { queue?: Record<string, unknown>[] })
      .queue ?? [];

  beforeEach(() => {
    localStorage.clear();
    resetOfflineCheckout();
    vi.clearAllMocks();
    localStorage.setItem(OFFLINE_FLAG_KEY, '1');
    sellProducts.mockReset();
    vi.mocked(useMutation).mockReturnValue(
      sellProducts as unknown as ReturnType<typeof useMutation>
    );
    vi.mocked(useQuery).mockImplementation(((query: unknown, args: unknown) => {
      if (args === 'skip') return undefined;
      const name = getFunctionName(query as FunctionReference<'query'>);
      if (name === 'purchases.getCheckoutItem') {
        return ITEMS[(args as { productId: string }).productId] ?? null;
      }
      return NO_OFFERS;
    }) as typeof useQuery);
    apiClient.query.mockReset().mockResolvedValue(copy);
    apiClient.mutation.mockReset().mockResolvedValue([]);
  });

  it('sells from the copy on the device and queues the sale', async () => {
    localStorage.setItem(STORE, JSON.stringify({ snapshot: copy, queue: [] }));
    vi.mocked(useConnected).mockReturnValue(false);
    renderPage();

    expect(
      await screen.findByText('Offline – die Kasse verkauft weiter', {}, { timeout: 3000 })
    ).toBeInTheDocument();
    scan('jack');
    scan('buch');
    const lines = screen.getAllByTestId('checkout-line');
    expect(within(lines[0]).getByText('Haken 12')).toBeInTheDocument();
    expect(within(lines[1]).getByText('Bereits verkauft.')).toBeInTheDocument();
    fireEvent.click(within(lines[1]).getByRole('button', { name: 'Aus dem Warenkorb' }));
    // Not in the copy: not part of this bazaar
    scan('hose');
    expect(screen.getByText('Gehört nicht zu diesem Basar.')).toBeInTheDocument();
    fireEvent.click(
      within(screen.getAllByTestId('checkout-line')[1]).getByRole('button', {
        name: 'Aus dem Warenkorb',
      })
    );

    fireEvent.click(screen.getByLabelText('9,00 € erhalten'));
    fireEvent.click(finish());

    expect(await screen.findByText(/offline gespeichert/)).toBeInTheDocument();
    expect(sellProducts).not.toHaveBeenCalled();
    expect(queue()).toEqual([
      expect.objectContaining({
        deskSaleId: expect.any(String),
        items: [
          {
            eventProductId: 'ep1',
            productId: 'jacke0000000000000001',
            title: 'Jacke',
            paid: 9,
            priceSource: 'list',
          },
        ],
      }),
    ]);
    expect(screen.getByText('1 Verkauf wartet aufs Nachbuchen.')).toBeInTheDocument();

    // Scanned again at this desk: sold
    scan('jack');
    expect(screen.getByText('Bereits verkauft.')).toBeInTheDocument();
  });

  it('queues a sale whose online reply never came, with the same ID', async () => {
    vi.mocked(useConnected).mockReturnValue(true);
    sellProducts.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPage();
    expect(await screen.findByText(/Offline bereit/)).toBeInTheDocument();

    scan('jack');
    fireEvent.click(screen.getByLabelText('9,00 € erhalten'));
    fireEvent.click(finish());

    expect(await screen.findByText(/offline gespeichert/)).toBeInTheDocument();
    const sent = sellProducts.mock.calls[0][0] as { deskSaleId: string };
    expect(queue().map((sale) => sale.deskSaleId)).toEqual([sent.deskSaleId]);
  });

  it('books a sale with a lost reply at once while the connection is up', async () => {
    vi.mocked(useConnected).mockReturnValue(true);
    sellProducts.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPage();
    expect(await screen.findByText(/Offline bereit/)).toBeInTheDocument();
    // The backend answers again: every sale it is sent is booked
    apiClient.mutation.mockImplementation((async (
      _: unknown,
      args?: { sales?: { deskSaleId: string }[] }
    ) =>
      (args?.sales ?? []).map((sale) => ({
        deskSaleId: sale.deskSaleId,
        bookedNow: true,
        conflicts: [],
      }))) as never);

    scan('jack');
    fireEvent.click(screen.getByLabelText('9,00 € erhalten'));
    fireEvent.click(finish());

    expect(await screen.findByText(/offline gespeichert/)).toBeInTheDocument();
    const sent = sellProducts.mock.calls[0][0] as { deskSaleId: string };
    // Not after the 30-second retry
    await waitFor(() =>
      expect(apiClient.mutation).toHaveBeenCalledWith(expect.anything(), {
        eventId: 'evt1',
        sales: [expect.objectContaining({ deskSaleId: sent.deskSaleId })],
      })
    );
    await waitFor(() => expect(queue()).toEqual([]));
  });

  it('shows a client error instead of queueing the sale', async () => {
    vi.mocked(useConnected).mockReturnValue(true);
    sellProducts.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'total')")
    );
    renderPage();
    expect(await screen.findByText(/Offline bereit/)).toBeInTheDocument();

    scan('jack');
    fireEvent.click(screen.getByLabelText('9,00 € erhalten'));
    fireEvent.click(finish());

    await waitFor(() => expect(sellProducts).toHaveBeenCalled());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByText(/offline gespeichert/)).not.toBeInTheDocument();
    expect(queue()).toEqual([]);
  });
});

describe('productIdFromCode', () => {
  it('reads the id from a label URL or a typed id', () => {
    expect(productIdFromCode('https://basar.de/products/view/abc123def456ghi789')).toBe(
      'abc123def456ghi789'
    );
    expect(productIdFromCode(' abc123def456ghi789 ')).toBe('abc123def456ghi789');
    expect(productIdFromCode('bazarpro://user/token')).toBeNull();
    expect(productIdFromCode('12')).toBeNull();
  });
});
