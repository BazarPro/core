import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from '../../lib/api/react';
import { type FunctionReference } from '../../lib/api/types';
import { getFunctionName } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { BroadcastDialog } from './BroadcastDialog';
import { BroadcastList } from './BroadcastList';
import { RecentBroadcastsCard } from './RecentBroadcastsCard';
import { SellerBroadcasts } from './SellerBroadcasts';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
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

    fireEvent.change(screen.getByLabelText('Empfänger'), { target: { value: 'pickup' } });
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
        audience: 'pickup',
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
      getFunctionName(query as FunctionReference<'query'>) === 'broadcasts.listEventBroadcasts'
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

const MESSAGES = [
  {
    _id: 'b2',
    subject: 'Abholung bis 16 Uhr',
    body: 'Bitte pünktlich.',
    important: false,
    createdAt: 2,
  },
  {
    _id: 'b1',
    subject: 'Parkplatz gesperrt',
    body: 'Am Bahnhof parken.',
    important: true,
    createdAt: 1,
  },
];

function mockQueries(results: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(
    ((query: unknown) =>
      results[getFunctionName(query as FunctionReference<'query'>)]) as typeof useQuery
  );
}

describe('SellerBroadcasts', () => {
  it('clears the marker of this bazaar and marks the unread messages as new', async () => {
    const markSeen = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useMutation).mockReturnValue(markSeen as unknown as ReturnType<typeof useMutation>);
    mockQueries({
      'broadcasts.getMyUnreadMessages': { [EVENT]: { count: 1, since: 2 } },
      'broadcasts.listEventBroadcasts': MESSAGES,
    });
    const { rerender } = render(<SellerBroadcasts eventId={EVENT} />);
    await waitFor(() =>
      expect(markSeen).toHaveBeenCalledWith({ area: 'messages', eventId: EVENT })
    );
    // Once seen the count drops to 0, the message stays marked as new
    mockQueries({
      'broadcasts.getMyUnreadMessages': {},
      'broadcasts.listEventBroadcasts': MESSAGES,
    });
    rerender(<SellerBroadcasts eventId={EVENT} />);
    expect(screen.getAllByText('Neu')).toHaveLength(1);
    expect(screen.getByText('Abholung bis 16 Uhr').parentElement).toHaveTextContent('Neu');
  });
});

describe('RecentBroadcastsCard', () => {
  beforeEach(() => {
    vi.mocked(useMutation).mockReturnValue(send as unknown as ReturnType<typeof useMutation>);
  });

  it('shows the latest messages; only the organizer can write', () => {
    mockQueries({
      'broadcasts.listEventBroadcasts': MESSAGES.map((message) => ({
        ...message,
        audience: 'pickup',
        recipientCount: 4,
      })),
    });
    const onShowAll = vi.fn();
    const { rerender } = render(
      <RecentBroadcastsCard eventId={EVENT} canSend={false} onShowAll={onShowAll} />
    );
    expect(screen.getByText('Abholung bis 16 Uhr')).toBeInTheDocument();
    expect(screen.getAllByText(/an 4 Verkäufer \(mit abzuholenden Artikeln\)/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Nachricht an Verkäufer/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Alle Nachrichten/ }));
    expect(onShowAll).toHaveBeenCalled();

    rerender(<RecentBroadcastsCard eventId={EVENT} canSend onShowAll={onShowAll} />);
    expect(screen.getByRole('button', { name: /Nachricht an Verkäufer/ })).toBeInTheDocument();
  });

  it('explains the messages while there are none', () => {
    mockQueries({ 'broadcasts.listEventBroadcasts': [] });
    render(<RecentBroadcastsCard eventId={EVENT} canSend onShowAll={vi.fn()} />);
    expect(screen.getByText(/Noch keine Nachrichten verschickt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alle Nachrichten/ })).toBeNull();
  });
});
