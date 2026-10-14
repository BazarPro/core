import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { formatDateRangeDE } from '../../lib/utils';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Textarea } from '../../components/ui/text-area';
import { toast } from 'sonner';
import { Input } from '../../components/ui/input';
import {
  ModerationActionDialog,
  type ModerationRequest,
} from '../../components/moderation/ModerationActionDialog';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { AdminGuard, AdminPageHeader, FilterTabs } from './components/AdminShared';

type AdminEvent = Doc<'events'> & {
  isApproved: boolean;
  approvalStatus: string;
  organizerName?: string;
  organizerEmail?: string;
};

type EventFilter = 'all' | 'pending' | 'running' | 'upcoming' | 'hidden';

export function AdminEventsPage() {
  return (
    <AdminGuard>
      <Events />
    </AdminGuard>
  );
}

function Events() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') ?? 'all') as EventFilter;
  const [search, setSearch] = useState('');
  const [request, setRequest] = useState<ModerationRequest | null>(null);
  const events = useQuery(api.events.getEventsForAdmin, {}) as AdminEvent[] | undefined;
  const approveEvent = useMutation(api.events.approveEventForAdmin);
  const rejectEvent = useMutation(api.events.rejectEventForAdmin);
  const restoreEvent = useMutation(api.moderation.restoreEvent);
  const [processingEventId, setProcessingEventId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectEventId, setRejectEventId] = useState<Id<'events'> | null>(null);
  const eventsLoading = events === undefined;

  const filtered = useMemo(() => {
    const now = Date.now();
    const term = search.trim().toLowerCase();
    return (events ?? [])
      .filter((event) => {
        if (filter === 'pending')
          return event.visibility === 'public' && event.approvalStatus === 'pending';
        if (filter === 'running') return event.startDate <= now && now <= event.endDate;
        if (filter === 'upcoming') return event.startDate > now;
        if (filter === 'hidden') return !!event.moderation;
        return true;
      })
      .filter(
        (event) =>
          !term ||
          event.title.toLowerCase().includes(term) ||
          event.location.toLowerCase().includes(term) ||
          (event.organizerName ?? '').toLowerCase().includes(term) ||
          (event.organizerEmail ?? '').toLowerCase().includes(term)
      )
      .sort((a, b) => b.startDate - a.startDate);
  }, [events, filter, search]);

  const pendingCount = (events ?? []).filter(
    (event) => event.visibility === 'public' && event.approvalStatus === 'pending'
  ).length;

  const setFilter = (value: EventFilter) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('filter');
    else next.set('filter', value);
    setParams(next, { replace: true });
  };

  const handleRestore = async (eventId: Id<'events'>) => {
    try {
      await restoreEvent({ eventId });
      toast.success('Sperre aufgehoben');
    } catch (error) {
      toast.error('Fehler', { description: getUserFacingErrorMessage(error) });
    }
  };

  const handleApprove = async (eventId: string) => {
    setProcessingEventId(eventId);
    try {
      await approveEvent({ eventId: eventId as Id<'events'> });
      toast.success('Event wurde freigegeben');
    } finally {
      setProcessingEventId(null);
    }
  };

  const openRejectDialog = (eventId: Id<'events'>) => {
    setRejectEventId(eventId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectEventId) return;
    const trimmed = rejectReason.trim();
    if (!trimmed) return;
    setProcessingEventId(rejectEventId);
    try {
      await rejectEvent({ eventId: rejectEventId, reason: trimmed });
      toast.success('Event wurde abgelehnt');
      setRejectDialogOpen(false);
    } finally {
      setProcessingEventId(null);
    }
  };

  const renderStatus = (event: AdminEvent) => {
    if (event.moderation) {
      return <Badge variant="destructive">Gesperrt</Badge>;
    }
    if (event.visibility !== 'public') {
      return <Badge variant="outline">Nicht öffentlich</Badge>;
    }
    if (event.approvalStatus === 'approved') {
      return <Badge variant="secondary">Freigegeben</Badge>;
    }
    if (event.approvalStatus === 'rejected') {
      return <Badge variant="destructive">Abgelehnt</Badge>;
    }
    return <Badge variant="outline">Freigabe ausstehend</Badge>;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Events"
        description="Öffentliche Basare freigeben, problematische Events sperren und jedes Event wie ein Veranstalter verwalten."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Alle' },
            { value: 'pending', label: 'Zur Freigabe', count: pendingCount },
            { value: 'running', label: 'Laufend' },
            { value: 'upcoming', label: 'Geplant' },
            { value: 'hidden', label: 'Gesperrt' },
          ]}
        />
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Titel, Ort oder Veranstalter"
            className="pl-9"
            aria-label="Events suchen"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Veranstalter</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventsLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center py-6">
                  Lade Events...
                </TableCell>
              </TableRow>
            ) : filtered.length ? (
              filtered.map((event) => (
                <TableRow key={event._id}>
                  <TableCell className="min-w-[14rem]">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-xs text-muted-foreground">{event.location}</div>
                    {event.moderation && (
                      <div className="text-xs text-destructive">
                        Gesperrt: {event.moderation.reason}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[10rem]">
                    {formatDateRangeDE(event.startDate, event.endDate)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{event.organizerName || 'Unbekannt'}</div>
                    <div className="text-xs text-muted-foreground">
                      {event.organizerEmail || '—'}
                    </div>
                  </TableCell>
                  <TableCell>{renderStatus(event)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/events/view/${event._id}`)}
                      >
                        Verwalten
                      </Button>
                      {event.visibility === 'public' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/public-events/${event._id}`)}
                        >
                          Ansehen
                        </Button>
                      )}
                      {event.moderation ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRestore(event._id)}
                        >
                          Entsperren
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            setRequest({ kind: 'hideEvent', id: event._id, label: event.title })
                          }
                        >
                          Sperren
                        </Button>
                      )}
                      {event.visibility === 'public' && event.approvalStatus === 'pending' && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={processingEventId === event._id}
                            onClick={() => handleApprove(event._id)}
                          >
                            Freigeben
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={processingEventId === event._id}
                            onClick={() => openRejectDialog(event._id)}
                          >
                            Ablehnen
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center py-6">
                  Keine Events gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Event ablehnen</DialogTitle>
            <DialogDescription>
              Bitte gib einen Grund an, warum dieses Event abgelehnt wird. Der Veranstalter erhält
              diese Information.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Grund der Ablehnung..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || !!processingEventId}
            >
              Event ablehnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
