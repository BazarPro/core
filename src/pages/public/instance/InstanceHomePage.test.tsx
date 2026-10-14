import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useQuery } from 'convex/react';
import { CurrentBazaarRedirect, InstanceHomePage } from './InstanceHomePage';

vi.mock('convex/react', () => ({ useQuery: vi.fn(), useConvexAuth: () => ({}) }));
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

describe('start page of a self-hosted instance', () => {
  it('leads to the current bazaar', () => {
    vi.mocked(useQuery).mockReturnValue({ _id: 'e1', title: 'Herbst', startDate: 0 });
    renderAt('/');
    expect(screen.getByText('Basar-Seite')).toBeTruthy();
  });

  it('shows the association when no bazaar is planned', () => {
    vi.mocked(useQuery).mockReturnValue(null);
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kinderbasar Ulm');
  });

  it('the event search leads to the current bazaar too', () => {
    vi.mocked(useQuery).mockReturnValue({ _id: 'e1', title: 'Herbst', startDate: 0 });
    renderAt('/browse-events');
    expect(screen.getByText('Basar-Seite')).toBeTruthy();
  });
});
