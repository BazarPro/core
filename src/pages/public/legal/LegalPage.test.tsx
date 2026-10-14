import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { runtimeConfig } from '../../../lib/runtimeConfig';
import { LegalPage } from './LegalPage';

vi.mock('convex/react', () => ({ useQuery: vi.fn(() => null) }));
vi.mock('../../../hooks/usePublicQuery', () => ({ usePublicQuery: vi.fn() }));
vi.mock('../../../lib/runtimeConfig', () => ({ runtimeConfig: { mode: 'platform' } }));
vi.mock('../../../components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('../../../components/layout/Footer', () => ({ Footer: () => null }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <LegalPage slug="imprint" />
    </MemoryRouter>
  );

describe('LegalPage', () => {
  beforeEach(() => {
    (runtimeConfig as { mode: string }).mode = 'platform';
  });

  it('shows the saved text', () => {
    vi.mocked(usePublicQuery).mockReturnValue({
      title: 'Impressum des Vereins',
      markdown: '## Angaben\n\nKinderbasar e. V.',
      version: 3,
      updatedAt: 0,
    });
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Impressum des Vereins');
    expect(screen.getByText('Kinderbasar e. V.')).toBeTruthy();
  });

  it('falls back to the bazarpro.de text on the platform, also while loading', () => {
    vi.mocked(usePublicQuery).mockReturnValue(undefined);
    renderPage();
    expect(screen.getByText('Angaben gemäß § 5 TMG')).toBeTruthy();
  });

  it('shows a notice instead of foreign texts on a self-hosted instance', () => {
    (runtimeConfig as { mode: string }).mode = 'single';
    vi.mocked(usePublicQuery).mockReturnValue(null);
    renderPage();
    expect(screen.getByText('Diese Seite wurde noch nicht eingerichtet.')).toBeTruthy();
    expect(screen.queryByText('Angaben gemäß § 5 TMG')).toBeNull();
  });
});
