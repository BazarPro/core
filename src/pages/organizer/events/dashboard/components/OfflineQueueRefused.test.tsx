import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfflineQueueRefused } from './OfflineQueueRefused';

function renderRefused(withDiscard: boolean) {
  const retry = vi.fn();
  const discard = vi.fn().mockResolvedValue(undefined);
  render(
    <OfflineQueueRefused
      message="Kein Zugriff auf diese Veranstaltung."
      pending="3 Offline-Aktionen warten."
      retry={retry}
      discard={withDiscard ? discard : undefined}
    />
  );
  return { retry, discard };
}

describe('OfflineQueueRefused', () => {
  it('says why the backend refuses and tries again on request', () => {
    const { retry } = renderRefused(false);
    expect(screen.getByRole('alert')).toHaveTextContent('3 Offline-Aktionen warten.');
    expect(screen.getByText(/Kein Zugriff auf diese Veranstaltung\./)).toBeInTheDocument();
    // Sales must not get lost: nothing to discard at the cash desk
    expect(screen.queryByRole('button', { name: 'Verwerfen' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('discards the queue only after confirming', async () => {
    const { discard } = renderRefused(true);
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(await screen.findByText('Offline-Aktionen verwerfen?')).toBeInTheDocument();
    expect(discard).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Verwerfen' }).at(-1)!);
    await waitFor(() => expect(discard).toHaveBeenCalledOnce());
  });
});
