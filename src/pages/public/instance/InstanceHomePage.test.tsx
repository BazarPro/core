import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useQuery } from '../../../lib/api/react';
import { type FunctionReference } from '../../../lib/api/types';
import { getFunctionName } from '../../../lib/api/functions';
import { CurrentBazaarRedirect, InstanceHomePage } from './InstanceHomePage';

vi.mock('../../../lib/api/react', () => ({ useQuery: vi.fn(), useAuthState: () => ({}) }));
vi.mock('../../../hooks/usePublicQuery', () => ({ usePublicQuery: () => [] }));
vi.mock('../../../hooks/useInstanceConfig', () => ({
  useInstanceConfig: () => ({ name: 'Kinderbasar Ulm', logoUrl: null }),
}));
vi.mock('../../../components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('../../../components/layout/Footer', () => ({ Footer: () => null }));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<InstanceHomePage />} />
        <Route path="/browse-events" element={<CurrentBazaarRedirect />} />
        <Route path="/public-events/:id" element={<p>Basar-Seite</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const CURRENT = { _id: 'e1', title: 'Herbst', startDate: 0 };

/** Answers getConfig with the start page setting and getCurrentEvent with `current`. */
function mockQueries(startPage: 'overview' | 'currentEvent', current: typeof CURRENT | null) {
  vi.mocked(useQuery).mockImplementation(((query: unknown) =>
    getFunctionName(query as FunctionReference<'query'>) === 'instance.getConfig'
      ? { startPage }
      : current) as typeof useQuery);
}

describe('start page of a self-hosted instance', () => {
  it('shows the overview by default, even with a running bazaar', () => {
    mockQueries('overview', CURRENT);
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kinderbasar Ulm');
  });

  it('leads to the current bazaar when the admins chose so', () => {
    mockQueries('currentEvent', CURRENT);
    renderAt('/');
    expect(screen.getByText('Basar-Seite')).toBeTruthy();
  });

  it('shows the association when no bazaar is planned', () => {
    mockQueries('currentEvent', null);
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kinderbasar Ulm');
  });

  it('the event search leads to the current bazaar too', () => {
    mockQueries('overview', CURRENT);
    renderAt('/browse-events');
    expect(screen.getByText('Basar-Seite')).toBeTruthy();
  });
});
