import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { PageErrorBoundary } from './PageErrorBoundary';

const client = { retryFailed: vi.fn() };
vi.mock('../../lib/api/react', () => ({ useApiClient: () => client }));

let failure: Error | null;

function Page() {
  if (failure) throw failure;
  return <p>Basar</p>;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  client.retryFailed.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PageErrorBoundary', () => {
  it('shows the error with a retry that loads the failed queries again', () => {
    failure = new ApiError(403, { code: 'auth.forbidden', message: 'Keine Berechtigung' });
    render(
      <PageErrorBoundary resetKey="/events">
        <Page />
      </PageErrorBoundary>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Die Seite konnte nicht geladen werden.');
    expect(screen.getByText('Dafür fehlt dir die Berechtigung.')).toBeInTheDocument();

    failure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(client.retryFailed).toHaveBeenCalled();
    expect(screen.getByText('Basar')).toBeInTheDocument();
  });

  it('hides the text of crashes and starts fresh on another page', () => {
    failure = new Error('x is undefined');
    const { rerender } = render(
      <PageErrorBoundary resetKey="/events">
        <Page />
      </PageErrorBoundary>
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('x is undefined');

    failure = null;
    rerender(
      <PageErrorBoundary resetKey="/account">
        <Page />
      </PageErrorBoundary>
    );
    expect(screen.getByText('Basar')).toBeInTheDocument();
  });
});
