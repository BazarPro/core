import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from 'convex/react';
import { getFunctionName, type FunctionReference } from 'convex/server';
import type { Id } from '../../../convex/_generated/dataModel';
import { BroadcastDialog } from './BroadcastDialog';
import { BroadcastList } from './BroadcastList';

vi.mock('convex/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const EVENT = 'evt1' as Id<'events'>;
const send = vi.fn();
let preview = { recipients: 12, left: 5, importantLeft: 1 };

describe('BroadcastDialog', () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue(12);
    preview = { recipients: 12, left: 5, importantLeft: 1 };
    vi.mocked(useMutation).mockReturnValue(send as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useQuery).mockImplementation((() => preview) as unknown as typeof useQuery);
  });

  it('sends an important message to the chosen sellers', async () => {
    const onOpenChange = vi.fn();
    render(<BroadcastDialog eventId={EVENT} open onOpenChange={onOpenChange} />);
    const submit = screen.getByRole('button', { name: 'An 12 Verkäufer senden' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Empfänger'), { target: { value: 'unsettled' } });
    fireEvent.change(screen.getByLabelText('Betreff'), { target: { value: 'Abholung' } });
    fireEvent.change(screen.getByLabelText('Nachricht'), {
      target: { value: 'Bitte bis 16 Uhr abholen.' },
    });
    fireEvent.click(screen.getByLabelText('Wichtig'));
    fireEvent.click(submit);
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        eventId: EVENT,
        subject: 'Abholung',
        body: 'Bitte bis 16 Uhr abholen.',
        audience: 'unsettled',
        important: true,
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows when the daily limit is used up', () => {
    preview = { recipients: 12, left: 0, importantLeft: 0 };
    render(<BroadcastDialog eventId={EVENT} open onOpenChange={vi.fn()} />);
    expect(screen.getByText('Für heute sind keine Nachrichten mehr möglich.')).toBeInTheDocument();
    expect(screen.getByLabelText('Wichtig')).toBeDisabled();
  });
});

describe('BroadcastList', () => {
  it('lists messages; the team also sees the recipients', () => {
    vi.mocked(useQuery).mockImplementation(((query: unknown) =>
      getFunctionName(query as FunctionReference<'query'>) === 'broadcasts:listEventBroadcasts'
        ? [
            {
              _id: 'b1',
              subject: 'Parkplatz gesperrt',
              body: 'Bitte am Bahnhof parken.',
              important: true,
              createdAt: 0,
              audience: 'all',
              recipientCount: 12,
            },
          ]
        : undefined) as typeof useQuery);
    render(<BroadcastList eventId={EVENT} title="Gesendete Nachrichten" />);
    expect(screen.getByText('Wichtig')).toBeInTheDocument();
    expect(screen.getByText(/an 12 Verkäufer \(alle\)/)).toBeInTheDocument();
    expect(screen.getByText('Bitte am Bahnhof parken.')).toBeInTheDocument();
  });
});
