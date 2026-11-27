import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from '../../../lib/api/react';
import { type FunctionReference } from '../../../lib/api/types';
import { getFunctionName } from '../../../lib/api/functions';
import { SearchEventsPage } from './SearchEventsPage';

const leaveEvent = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/api/react', () => ({
  useQuery: vi.fn(),
  useMutation: () => leaveEvent,
  useAuthState: () => ({}),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../components/ui/image-with-fallback', () => ({ ImageWithFallback: () => null }));
// The dialogs have their own logic; here it only matters that the page opens them
vi.mock('../../../components/events/EventRegistrationDialog', () => ({
  EventRegistrationDialog: ({
    open,
    eventTitle,
    onSuccess,
  }: {
    open: boolean;
    eventTitle: string;
    onSuccess: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={`Anmeldung ${eventTitle}`}>
        <button onClick={onSuccess}>fertig</button>
      </div>
    ) : null,
}));
vi.mock('../../../components/events/PostRegistrationSuccessDialog', () => ({
  PostRegistrationSuccessDialog: ({ open, eventTitle }: { open: boolean; eventTitle: string }) =>
    open ? <div role="dialog" aria-label={`Angemeldet ${eventTitle}`} /> : null,
}));

const DAY = 24 * 60 * 60 * 1000;
const LONG_TITLE = 'Großer Kinderkleider- und Spielzeugbasar der Grundschule am Lindenplatz';

function event(id: string, title: string, inDays: number) {
  const startDate = Date.now() + inDays * DAY;
  return {
    _id: id,
    title,
    description: '',
    location: 'Ulm',
    startDate,
    endDate: startDate + DAY,
    categories: [],
    services: [],
    commission: 10,
  };
}

const MINE = {
  ...event('e1', 'Herbstbasar', 3),
  sellerLogistics: { dropoffStart: Date.now() + 2 * DAY },
};
const OTHER = { ...event('e2', LONG_TITLE, 10), postalCode: '89073', city: 'Ulm' };
const PAST = event('e3', 'Frühjahrsbasar', -30);

function mockQueries(
  registered: unknown[] | undefined,
  unread: Record<string, unknown> = {},
  excluded: unknown[] = [],
  notices: Record<string, number> = {}
) {
  vi.mocked(useQuery).mockImplementation(((query: unknown, args: unknown) => {
    if (!query || args === 'skip') return undefined;
    switch (getFunctionName(query as FunctionReference<'query'>)) {
      case 'events.get':
        return (args as { includePast: boolean }).includePast ? [MINE, OTHER, PAST] : [MINE, OTHER];
      case 'events.getMyRegisteredEvents':
        return registered;
      case 'events.getMyProductCountForEvent':
        return 4;
      case 'sellerNumbers.getMySellerNumber':
        return 12;
      case 'broadcasts.getMyUnreadMessages':
        return unread;
      case 'eventExclusions.getMyExcludedEvents':
        return excluded;
      case 'notifications.getUnreadNoticeCounts':
        return notices;
      default:
        return undefined;
    }
  }) as typeof useQuery);
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/browse-events']}>
      <Routes>
        <Route path="/browse-events" element={<SearchEventsPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function search(text: string) {
  const field = screen.getByLabelText('PLZ oder Ort');
  fireEvent.change(field, { target: { value: text } });
  fireEvent.submit(field.closest('form')!);
}

describe('find bazaars', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    leaveEvent.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('lists the own bazaars apart from the new ones', () => {
    mockQueries([MINE]);
    renderPage();
    const mine = screen.getByRole('region', { name: 'Meine Basare' });
    const discover = screen.getByRole('region', { name: 'Neue Basare entdecken' });
    expect(within(mine).getByText('Herbstbasar')).toBeTruthy();
    expect(within(mine).queryByText(LONG_TITLE)).toBeNull();
    expect(within(discover).getByText(LONG_TITLE)).toBeTruthy();
    expect(within(discover).queryByText('Herbstbasar')).toBeNull();
  });

  it('leaves out "my bazaars" without registrations', () => {
    mockQueries([]);
    renderPage();
    expect(screen.queryByRole('region', { name: 'Meine Basare' })).toBeNull();
    expect(screen.getByText('Herbstbasar')).toBeTruthy();
  });

  it('shows the whole title of long names over two lines', () => {
    mockQueries([]);
    renderPage();
    const title = screen.getByRole('heading', { name: LONG_TITLE });
    expect(title.getAttribute('title')).toBe(LONG_TITLE);
    expect(title.className).toContain('line-clamp-2');
  });

  it('does not offer to join while the registrations load', () => {
    mockQueries(undefined);
    renderPage();
    expect(screen.queryByRole('button', { name: 'Anmelden' })).toBeNull();
  });

  it('shows seller number, items and hand-in time on own bazaars', () => {
    mockQueries([MINE]);
    renderPage();
    const mine = screen.getByRole('region', { name: 'Meine Basare' });
    expect(within(mine).getByText(/Nr\. 12/)).toBeTruthy();
    expect(within(mine).getByRole('link', { name: '4 Artikel' })).toBeTruthy();
    expect(within(mine).getByText('Abgabe:')).toBeTruthy();
  });

  it('shows an exclusion among the own bazaars and clears its marker', () => {
    const excludedAt = new Date(2026, 10, 14).getTime();
    leaveEvent.mockResolvedValue(null);
    mockQueries([], {}, [{ event: OTHER, exclusion: { excludedAt, reason: 'Nichts abgeholt' } }], {
      participation: 1,
    });
    renderPage();
    const mine = screen.getByRole('region', { name: 'Meine Basare' });
    expect(within(mine).getByText(LONG_TITLE)).toBeTruthy();
    expect(within(mine).getByText('Ausgeschlossen')).toBeTruthy();
    expect(within(mine).getByText('Ausgeschlossen seit 14. November 2026')).toBeTruthy();
    // The reason stays on the bazaar page, the card keeps its height
    expect(within(mine).queryByText('Begründung: Nichts abgeholt')).toBeNull();
    // Neither joining nor leaving
    expect(within(mine).queryByRole('button', { name: 'Anmelden' })).toBeNull();
    expect(within(mine).queryByRole('button', { name: 'Vom Basar abmelden' })).toBeNull();
    const discover = screen.getByRole('region', { name: 'Neue Basare entdecken' });
    expect(within(discover).queryByText(LONG_TITLE)).toBeNull();
    // Seen here: the red marker at "Basare" goes
    expect(leaveEvent).toHaveBeenCalledWith({ area: 'participation' });
  });

  it('searches the new bazaars around a place, the own ones stay', async () => {
    mockQueries([MINE]);
    renderPage();
    search('89075');
    const discover = screen.getByRole('region', { name: 'Neue Basare entdecken' });
    expect(await within(discover).findByText(/unter 5 km|ca\. \d+ km/)).toBeTruthy();
    expect(within(discover).getByText(LONG_TITLE)).toBeTruthy();
    search('Hamburg');
    expect(
      await within(discover).findByText(/Im Umkreis von 25 km gibt es gerade keinen Basar/)
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Meine Basare' })).toBeTruthy();
  });

  it('says so when there is no other bazaar', () => {
    mockQueries([MINE, OTHER]);
    renderPage();
    expect(screen.getByText(/Alle 2 Basare hier kennst du schon/)).toBeTruthy();
  });

  it('loads past bazaars on request and greys them out', () => {
    mockQueries([]);
    renderPage();
    expect(screen.queryByText('Frühjahrsbasar')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Vergangene' }));
    const card = screen.getByText('Frühjahrsbasar').closest('.opacity-75');
    expect(card).not.toBeNull();
  });

  it('opens the registration and then the confirmation', () => {
    mockQueries([MINE]);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    const dialog = screen.getByRole('dialog', { name: `Anmeldung ${LONG_TITLE}` });
    fireEvent.click(within(dialog).getByRole('button', { name: 'fertig' }));
    expect(screen.getByRole('dialog', { name: `Angemeldet ${LONG_TITLE}` })).toBeTruthy();
  });

  it('leaves a bazaar after confirming', async () => {
    leaveEvent.mockResolvedValue(null);
    mockQueries([MINE]);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Vom Basar abmelden' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Abmeldung von Herbstbasar erfolgreich')
    );
    expect(leaveEvent).toHaveBeenCalledWith({ eventId: 'e1' });
  });

  it('reports when leaving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    leaveEvent.mockRejectedValue(new Error(''));
    mockQueries([MINE]);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Vom Basar abmelden' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Abmeldung fehlgeschlagen', {
        description: 'Ein unbekannter Fehler ist aufgetreten.',
      })
    );
  });

  it('leads to the bazaar page for new messages and details', () => {
    mockQueries([MINE], { e1: { count: 2 } });
    renderPage();
    fireEvent.click(screen.getByRole('link', { name: /2 neue Nachrichten vom Veranstalter/ }));
    expect(screen.getByTestId('location').textContent).toBe('/public-events/e1');
  });

  it('leads to the items of an own bazaar', () => {
    mockQueries([MINE]);
    renderPage();
    fireEvent.click(screen.getByRole('link', { name: '4 Artikel' }));
    expect(screen.getByTestId('location').textContent).toBe('/my-products');
  });

  it('opens the details of a new bazaar', () => {
    mockQueries([MINE]);
    renderPage();
    const discover = screen.getByRole('region', { name: 'Neue Basare entdecken' });
    fireEvent.click(within(discover).getByRole('link', { name: LONG_TITLE }));
    expect(screen.getByTestId('location').textContent).toBe('/public-events/e2');
  });
});
