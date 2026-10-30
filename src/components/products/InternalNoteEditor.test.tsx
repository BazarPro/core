import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Id } from '../../lib/api/types';
import { InternalNoteEditor } from './InternalNoteEditor';

const run = vi.hoisted(() => vi.fn());
vi.mock('../../lib/offlineActions', () => ({ useOfflineIntake: () => ({ run }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderEditor(note?: string) {
  render(
    <InternalNoteEditor
      eventId={'evt1' as Id<'events'>}
      eventProductId={'ep1' as Id<'eventProducts'>}
      title="Ski"
      note={note}
    />
  );
  return screen.getByRole('textbox', { name: 'Interne Notiz' });
}

describe('InternalNoteEditor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves the note as an intake action, online or queued offline', async () => {
    run.mockResolvedValueOnce({ queued: false }).mockResolvedValueOnce({ queued: true });
    const input = renderEditor();
    const save = screen.getByRole('button', { name: 'Speichern' });
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Haken 12' } });
    fireEvent.click(save);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Notiz gespeichert'));
    expect(run).toHaveBeenCalledWith(
      {
        name: 'eventProducts.setEventProductNote',
        args: { eventProductId: 'ep1', note: 'Haken 12' },
      },
      'Ski'
    );

    // Enter saves too; offline it is kept for later
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(toast.success).toHaveBeenLastCalledWith(
        'Offline gespeichert – wird nachgeholt, sobald wieder Internet da ist.'
      )
    );
  });

  it('removes the note and shows why saving failed', async () => {
    run.mockResolvedValueOnce({ queued: false }).mockRejectedValueOnce(new Error('kaputt'));
    const input = renderEditor('Haken 3');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Notiz entfernt'));

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
