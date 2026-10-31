import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthState, useQuery } from '../../lib/api/react';
import { getFunctionName } from '../../lib/api/functions';
import type { FunctionReference } from '../../lib/api/types';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { DashboardPage } from './DashboardPage';
import { HomePage } from './HomePage';
import { resetSelectedEvent, selectEvent } from '../../lib/selectedEvent';

const markSeen = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../lib/api/react', () => ({
  useQuery: vi.fn(),
  useAuthState: vi.fn(),
  useMutation: () => markSeen,
}));
vi.mock('../../hooks/useInstanceConfig', () => ({ useInstanceConfig: vi.fn() }));
const role = vi.hoisted(() => ({ current: 'participant' }));
vi.mock('../../context/UserRoleContext', () => ({
  useUserRole: () => ({ role: role.current }),
}));
vi.mock('../administrator/AdminOverviewPage', () => ({
  AdminOverviewPage: () => <h1>Admin-Übersicht</h1>,
}));

const DAY = 24 * 3600 * 1000;
const now = Date.now();
const kita = {
  _id: 'e1',
  title: 'Kinderbasar Kita Sonnenschein – Herbst-Flohmarkt für Kinderkleidung und Spielzeug',
  startDate: now + 3 * DAY,
  endDate: now + 3 * DAY + 6 * 3600 * 1000,
  location: 'Turnhalle Ulm',
};

let results: Record<string, unknown>;

function seller(overrides: Record<string, unknown> = {}) {
  results = {
    'users.viewer': { _id: 'u1', firstName: 'Erika' },
    'events.getMyRegisteredEvents': [
      kita,
      { _id: 'e2', title: 'Fahrradbörse', startDate: now + 30 * DAY, endDate: now + 31 * DAY },
      { _id: 'old', title: 'Frühjahrsbasar', startDate: now - 90 * DAY, endDate: now - 89 * DAY },
    ],
    'products.getMyProducts': [
      { _id: 'p1', eventIds: ['e1'] },
      { _id: 'p2', eventIds: ['e1'] },
      { _id: 'p3', eventIds: ['e1'], sold: true },
      { _id: 'p4', eventIds: [] },
    ],
    'purchases.getMySales': [
      { event: kita, paid: true, sellerNumber: 17, items: [{}, {}], totals: { payout: 12.5 } },
    ],
    'notifications.getUnreadNoticeCounts': { products: 0, sales: 2, messages: 0, events: 1 },
    'instance.getMyAccess': { canOrganize: false, canCreateEvents: false },
    'moderation.isViewerAdmin': false,
    ...overrides,
  };
}

function renderAt(element: React.ReactNode) {
  function Where() {
    const location = useLocation();
    return (
      <div data-testid="where">{`${location.pathname}|${JSON.stringify(location.state)}`}</div>
    );
  }
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={element} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(useQuery).mockImplementation(((fn: unknown, args?: unknown) =>
    args === 'skip'
      ? undefined
      : results[getFunctionName(fn as FunctionReference<'query'>)]) as typeof useQuery);
  vi.mocked(useInstanceConfig).mockReturnValue({ isSingle: false } as ReturnType<
    typeof useInstanceConfig
  >);
  localStorage.clear();
  resetSelectedEvent();
  role.current = 'participant';
});

describe('DashboardPage', () => {
  it('shows the next bazaar with its full title, items and seller status', () => {
    seller();
    renderAt(<DashboardPage />);
    expect(screen.getByRole('heading', { name: 'Hallo Erika!' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: kita.title })).toBeInTheDocument();
    expect(screen.getByText('2 Artikel angemeldet')).toBeInTheDocument();
    expect(screen.getByText('Verkäufernummer 17')).toBeInTheDocument();
    expect(screen.getByText('Gebühr bezahlt')).toBeInTheDocument();
    // Past bazaars do not count
    expect(screen.getByText('und 1 weiterer Basar')).toBeInTheDocument();
    expect(screen.getByText('3 verfügbare Artikel')).toBeInTheDocument();
    expect(screen.getByText('2 verkauft · 12,50 € Auszahlung')).toBeInTheDocument();
  });

  it('leads to the items of that bazaar', () => {
    seller();
    renderAt(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Artikel verwalten' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/my-products|{"filterEvent":"e1"}');
  });

  it('points new sellers to the bazaars', () => {
    seller({ 'events.getMyRegisteredEvents': [], 'purchases.getMySales': [] });
    renderAt(<DashboardPage />);
    expect(screen.getByText('Du bist noch für keinen Basar angemeldet.')).toBeInTheDocument();
    expect(screen.getByText('Noch nichts verkauft')).toBeInTheDocument();
  });

  const organizer = (events: Record<string, unknown>[], roles: unknown[] = []) => {
    seller({
      'instance.getMyAccess': { canOrganize: true, canCreateEvents: true },
      'events.getMyEvents': events,
      'eventRoles.getMyRolesForEvents': roles,
      'notifications.getUnreadNoticeCounts': { products: 0, sales: 0, messages: 0, events: 2 },
    });
    role.current = 'organizer';
  };
  const event = (id: string, title: string, inDays: number, extra = {}) => ({
    _id: id,
    title,
    startDate: now + inDays * DAY,
    endDate: now + inDays * DAY + 6 * 3600 * 1000,
    visibility: 'public',
    approvalStatus: 'approved',
    ...extra,
  });

  it('shows organizers their most current event, the others to choose from, the past folded', () => {
    organizer([
      event('o2', 'Fahrradbörse Ulm', 12, { approvalStatus: 'pending' }),
      { ...event('o1', kita.title, 3), coverImage: undefined },
      event('o0', 'Frühjahrsbasar', -60),
    ]);
    renderAt(<DashboardPage />);
    const current = screen.getByTestId('current-event');
    expect(within(current).getByRole('heading', { name: kita.title })).toBeInTheDocument();
    expect(within(current).getByText('Freigegeben')).toBeInTheDocument();
    const later = screen
      .getByRole('heading', { name: 'Weitere Veranstaltungen' })
      .closest('section')!;
    expect(within(later).getByText('Fahrradbörse Ulm')).toBeInTheDocument();
    expect(within(later).getByText('Freigabe ausstehend')).toBeInTheDocument();
    // Past events stay folded until asked for
    expect(screen.queryByText('Frühjahrsbasar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Vergangene Veranstaltungen (1)' }));
    expect(screen.getByText('Frühjahrsbasar')).toBeInTheDocument();
    // Opening the overview clears the organizer's menu marker
    expect(markSeen).toHaveBeenCalledWith({ area: 'events' });
    // Only this role
    expect(screen.queryByRole('heading', { name: 'Verkaufen' })).toBeNull();
    fireEvent.click(within(current).getByRole('button', { name: 'Kasse' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/events/view/o1/checkout');
  });

  it('switches the current event to the one chosen in the overview', () => {
    organizer([event('o1', kita.title, 3), event('o2', 'Fahrradbörse Ulm', 12)]);
    renderAt(<DashboardPage />);
    const later = screen
      .getByRole('heading', { name: 'Weitere Veranstaltungen' })
      .closest('section')!;
    fireEvent.click(within(later).getByRole('button', { name: 'Auswählen' }));
    expect(
      within(screen.getByTestId('current-event')).getByRole('heading', { name: 'Fahrradbörse Ulm' })
    ).toBeInTheDocument();
  });

  it('keeps an event chosen before, e.g. by opening its page', () => {
    selectEvent('o0');
    organizer([event('o1', kita.title, 3), event('o0', 'Frühjahrsbasar', -60)]);
    renderAt(<DashboardPage />);
    const current = screen.getByTestId('current-event');
    expect(within(current).getByRole('heading', { name: 'Frühjahrsbasar' })).toBeInTheDocument();
    expect(within(current).getByText('Beendet')).toBeInTheDocument();
  });

  it('shows why an event was rejected and where one only helps', () => {
    organizer(
      [event('o1', kita.title, 3, { approvalStatus: 'rejected', rejectionReason: 'Kein Basar' })],
      [{ eventId: 'o1', roles: ['coorganizer'] }]
    );
    renderAt(<DashboardPage />);
    const current = screen.getByTestId('current-event');
    expect(within(current).getAllByText('Abgelehnt')).toHaveLength(2);
    expect(within(current).getByText('Kein Basar')).toBeInTheDocument();
    expect(within(current).getByText('Helfer')).toBeInTheDocument();
  });

  it('folds many upcoming events', () => {
    organizer(
      Array.from({ length: 6 }, (_, i) =>
        event(`o${i}`, `Basar ${i}`, i + 1, { visibility: 'logged-in' })
      )
    );
    renderAt(<DashboardPage />);
    const later = screen
      .getByRole('heading', { name: 'Weitere Veranstaltungen' })
      .closest('section')!;
    expect(within(later).getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(within(later).getByRole('button', { name: 'Alle 5 anzeigen' }));
    expect(within(later).getAllByRole('listitem')).toHaveLength(5);
    // Events that are not public need no approval
    expect(screen.queryByText('Freigegeben')).toBeNull();
  });

  it('invites organizers without events to create one', () => {
    organizer([]);
    renderAt(<DashboardPage />);
    expect(
      screen.getByRole('heading', { name: 'Keine Veranstaltungen gefunden' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Neue Veranstaltung' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/events/new');
  });

  it('shows the demo note in the overview instead of a banner', () => {
    seller({ 'featureFlags.get': { is_demo_mode: true }, 'users.viewer': { _id: 'u1' } });
    renderAt(<DashboardPage />);
    expect(screen.getByText(/Demo-Modus/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Willkommen zurück!' })).toBeInTheDocument();
  });

  it('waits for the account', () => {
    seller({ 'users.viewer': undefined });
    renderAt(<DashboardPage />);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('falls back to selling when the account has no organizer access', () => {
    seller();
    role.current = 'organizer';
    renderAt(<DashboardPage />);
    expect(screen.getByRole('heading', { name: 'Verkaufen' })).toBeInTheDocument();
  });

  it('shows admins the admin overview', () => {
    seller({ 'moderation.isViewerAdmin': true });
    role.current = 'administrator';
    renderAt(<DashboardPage />);
    expect(screen.getByRole('heading', { name: 'Admin-Übersicht' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Verkaufen' })).toBeNull();
  });

  it('speaks of the current bazaar on a self-hosted instance', () => {
    seller({ 'events.getMyRegisteredEvents': [] });
    vi.mocked(useInstanceConfig).mockReturnValue({ isSingle: true } as ReturnType<
      typeof useInstanceConfig
    >);
    renderAt(<DashboardPage />);
    expect(
      screen.getByText('Du bist noch nicht für den aktuellen Basar angemeldet.')
    ).toBeInTheDocument();
    // No marketing pages there
    expect(screen.queryByText('Mehr über BazarPro')).toBeNull();
  });
});

describe('HomePage', () => {
  const landing = <p>Landingpage</p>;

  it('shows visitors the landing page and signed-in users the overview', () => {
    seller();
    vi.mocked(useAuthState).mockReturnValue({ isLoading: false, isAuthenticated: false });
    renderAt(<HomePage landing={landing} />);
    expect(screen.getByText('Landingpage')).toBeInTheDocument();
  });

  it('remembers the sign-in, so returning users see no landing page while loading', async () => {
    seller();
    vi.mocked(useAuthState).mockReturnValue({ isLoading: false, isAuthenticated: true });
    renderAt(<HomePage landing={landing} />);
    // The overview is its own chunk
    expect(await screen.findByRole('heading', { name: 'Hallo Erika!' })).toBeInTheDocument();
    expect(localStorage.getItem('bazarpro.signedIn')).toBe('1');

    vi.mocked(useAuthState).mockReturnValue({ isLoading: true, isAuthenticated: false });
    renderAt(<HomePage landing={landing} />);
    expect(screen.queryByText('Landingpage')).toBeNull();
  });
});
