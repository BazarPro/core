import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthState, useQuery } from '../../lib/api/react';
import { getFunctionName } from '../../lib/api/functions';
import type { FunctionReference } from '../../lib/api/types';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { DashboardPage } from './DashboardPage';
import { HomePage } from './HomePage';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn(), useAuthState: vi.fn() }));
vi.mock('../../hooks/useInstanceConfig', () => ({ useInstanceConfig: vi.fn() }));

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
    expect(screen.queryByText('Veranstalten')).toBeNull();
    expect(screen.queryByText('Verwalten')).toBeNull();
  });

  it('adds the own bazaars for organizers', () => {
    seller({
      'instance.getMyAccess': { canOrganize: true, canCreateEvents: true },
      'events.getMyEvents': [
        {
          _id: 'o2',
          title: 'Fahrradbörse Ulm',
          startDate: now + 12 * DAY,
          endDate: now + 13 * DAY,
          approvalStatus: 'pending',
        },
        { ...kita, _id: 'o1' },
        { _id: 'o0', title: 'Vorbei', startDate: now - 9 * DAY, endDate: now - 8 * DAY },
      ],
    });
    renderAt(<DashboardPage />);
    const organizer = screen.getByRole('heading', { name: 'Veranstalten' }).closest('section')!;
    const rows = within(organizer).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('p')?.textContent)).toEqual([
      kita.title,
      'Fahrradbörse Ulm',
    ]);
    expect(within(rows[1]).getByText('Wartet auf Freigabe')).toBeInTheDocument();
    expect(within(organizer).getByText('Neuen Basar anlegen')).toBeInTheDocument();
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Kasse' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/events/view/o1/checkout');
  });

  it('shows what waits for admins', () => {
    seller({
      'moderation.isViewerAdmin': true,
      'moderation.getMenuCounts': { openReports: 2, unhandledMessages: 0 },
      'events.countPendingApprovals': 1,
    });
    renderAt(<DashboardPage />);
    const admin = screen.getByRole('heading', { name: 'Verwalten' }).closest('section')!;
    expect(within(admin).getByText('2 offene Meldungen')).toBeInTheDocument();
    expect(within(admin).getByText('1 Basar wartet auf Freigabe')).toBeInTheDocument();
    expect(within(admin).getByText('Nichts zu tun')).toBeInTheDocument();
  });

  it('speaks of the current bazaar on a self-hosted instance', () => {
    seller({ 'events.getMyRegisteredEvents': [], 'moderation.isViewerAdmin': true });
    vi.mocked(useInstanceConfig).mockReturnValue({ isSingle: true } as ReturnType<
      typeof useInstanceConfig
    >);
    renderAt(<DashboardPage />);
    expect(
      screen.getByText('Du bist noch nicht für den aktuellen Basar angemeldet.')
    ).toBeInTheDocument();
    // Nothing to approve and no marketing pages there
    expect(screen.queryByText(/Freigabe/)).toBeNull();
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

  it('remembers the sign-in, so returning users see no landing page while loading', () => {
    seller();
    vi.mocked(useAuthState).mockReturnValue({ isLoading: false, isAuthenticated: true });
    renderAt(<HomePage landing={landing} />);
    expect(screen.getByRole('heading', { name: 'Hallo Erika!' })).toBeInTheDocument();
    expect(localStorage.getItem('bazarpro.signedIn')).toBe('1');

    vi.mocked(useAuthState).mockReturnValue({ isLoading: true, isAuthenticated: false });
    renderAt(<HomePage landing={landing} />);
    expect(screen.queryByText('Landingpage')).toBeNull();
  });
});
