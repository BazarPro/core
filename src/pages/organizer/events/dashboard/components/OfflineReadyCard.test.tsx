import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useMutation } from '../../../../../lib/api/react';
import { fetchEventKeys } from '../../../../../lib/checkInCode';
import { Incomplete, NotStored, useOfflinePreparation } from '../../../../../lib/offlinePrefetch';
import { OfflineReadyCard } from './OfflineReadyCard';

vi.mock('../../../../../lib/api/react', () => ({ useMutation: vi.fn(), useApiClient: vi.fn() }));
vi.mock('../../../../../lib/checkInCode', () => ({ fetchEventKeys: vi.fn() }));
vi.mock('../../../../../lib/offlinePrefetch', () => ({
  useOfflinePreparation: vi.fn(),
  Incomplete: class Incomplete extends Error {},
  NotStored: class NotStored extends Error {},
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const EVENT = { startDate: Date.now(), endDate: Date.now() + 3_600_000 };
const prepare = vi.fn();
const renew = vi.fn();

function preparation(state: Partial<ReturnType<typeof useOfflinePreparation>>) {
  vi.mocked(useOfflinePreparation).mockReturnValue({
    available: true,
    prepared: null,
    preparing: false,
    outdated: false,
    prepare,
    ...state,
  });
}

describe('OfflineReadyCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepare.mockReset().mockResolvedValue(undefined);
    vi.mocked(fetchEventKeys).mockResolvedValue(undefined);
    renew.mockReset().mockResolvedValue({ success: true });
    vi.mocked(useMutation).mockReturnValue(renew as unknown as ReturnType<typeof useMutation>);
  });

  it('is not shown where the bazaar cannot be prepared', () => {
    preparation({ available: false });
    const { container } = render(<OfflineReadyCard eventId="evt1" event={EVENT} canRenewKeys />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says since when the bazaar is ready and when there is something new', () => {
    preparation({ prepared: { products: 3, at: Date.now() }, outdated: true });
    render(<OfflineReadyCard eventId="evt1" event={EVENT} canRenewKeys={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Offline bereit · 3 Artikel/);
    expect(screen.getByText(/Seitdem gibt es neue Verkäufer oder Artikel/)).toBeInTheDocument();
    // Only the organizer renews the ID codes
    expect(screen.queryByRole('button', { name: /Ausweis-Codes/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Jetzt laden/ }));
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('shows the date of a copy from another day', () => {
    const yesterday = new Date(Date.now() - 24 * 3_600_000);
    preparation({ prepared: { products: 1, at: yesterday.getTime() } });
    render(<OfflineReadyCard eventId="evt1" event={EVENT} canRenewKeys={false} />);
    const day = String(yesterday.getDate()).padStart(2, '0');
    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`Stand ${day}\\.`));
  });

  it('tells while it loads and before the first time', () => {
    preparation({ preparing: true });
    const { rerender } = render(
      <OfflineReadyCard eventId="evt1" event={EVENT} canRenewKeys={false} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Basar wird für offline geladen…');
    preparation({});
    rerender(<OfflineReadyCard eventId="evt1" event={EVENT} canRenewKeys={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Noch nicht für offline geladen.');
  });

  it('renews the ID codes only after confirming', async () => {
    preparation({ prepared: { products: 3, at: Date.now() } });
    render(<OfflineReadyCard eventId="evt1" event={EVENT} canRenewKeys />);
    fireEvent.click(screen.getByRole('button', { name: /Ausweis-Codes erneuern/ }));
    expect(await screen.findByText('Ausweis-Codes erneuern?')).toBeInTheDocument();
    expect(renew).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /Ausweis-Codes erneuern/ }).at(-1)!);
    await waitFor(() => expect(renew).toHaveBeenCalledWith({ eventId: 'evt1' }));
    // This device takes the new keys at once, not only with the next update
    await waitFor(() => expect(fetchEventKeys).toHaveBeenCalledWith(undefined, 'evt1'));
  });

  it('says why loading failed instead of keeping the old state quietly', async () => {
    preparation({ prepared: { products: 3, at: Date.now() } });
    render(<OfflineReadyCard eventId="evt1" event={EVENT} canRenewKeys={false} />);
    const refresh = screen.getByRole('button', { name: /Jetzt laden/ });

    prepare.mockRejectedValueOnce(new Incomplete(1));
    fireEvent.click(refresh);
    await waitFor(() =>
      expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/Nicht alles/))
    );
    prepare.mockRejectedValueOnce(new NotStored());
    fireEvent.click(refresh);
    await waitFor(() =>
      expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/Speicher/))
    );
    prepare.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(refresh);
    await waitFor(() =>
      expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/Keine Verbindung/))
    );
  });

  it('says why renewing failed', async () => {
    renew.mockRejectedValueOnce(new Error('kaputt'));
    preparation({ prepared: { products: 3, at: Date.now() } });
    render(<OfflineReadyCard eventId="evt1" event={EVENT} canRenewKeys />);
    fireEvent.click(screen.getByRole('button', { name: /Ausweis-Codes erneuern/ }));
    fireEvent.click(
      (await screen.findAllByRole('button', { name: /Ausweis-Codes erneuern/ })).at(-1)!
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
