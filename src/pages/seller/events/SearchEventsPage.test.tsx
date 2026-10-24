import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery } from '../../../lib/api/react';
import { type FunctionReference } from '../../../lib/api/types';
import { getFunctionName } from '../../../lib/api/functions';
import { SearchEventsPage } from './SearchEventsPage';

vi.mock('../../../lib/api/react', () => ({
  useQuery: vi.fn(),
  useMutation: () => vi.fn(),
  useAuthState: () => ({}),
}));
vi.mock('../../../components/ui/image-with-fallback', () => ({ ImageWithFallback: () => null }));

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

const MINE = event('e1', 'Herbstbasar', 3);
const OTHER = event('e2', LONG_TITLE, 10);

function mockQueries(registered: unknown[] | undefined) {
  vi.mocked(useQuery).mockImplementation(((query: unknown, args: unknown) => {
    if (!query || args === 'skip') return undefined;
    switch (getFunctionName(query as FunctionReference<'query'>)) {
      case 'events.get':
        return [MINE, OTHER];
      case 'events.getMyRegisteredEvents':
        return registered;
      case 'broadcasts.getMyUnreadMessages':
        return {};
      default:
        return undefined;
    }
  }) as typeof useQuery);
}

function renderPage() {
  render(
    <MemoryRouter>
      <SearchEventsPage />
    </MemoryRouter>
  );
}

describe('find bazaars', () => {
  beforeEach(() => vi.mocked(useQuery).mockReset());

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
});
