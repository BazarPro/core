import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
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

type AdminEvent = Doc<'events'> & {
  isApproved: boolean;
  approvalStatus: string;
  organizerName?: string;
  organizerEmail?: string;
};

export function AdminEventsPage() {
  const navigate = useNavigate();
  const user = useQuery(api.users.viewer);
  const isAdmin = user?.systemRole === 'admin';
  const events = useQuery(api.events.getEventsForAdmin, isAdmin ? {} : 'skip') as
    | AdminEvent[]
    | undefined;
  const approveEvent = useMutation(api.events.approveEventForAdmin);
  const rejectEvent = useMutation(api.events.rejectEventForAdmin);
  const [processingEventId, setProcessingEventId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectEventId, setRejectEventId] = useState<Id<'events'> | null>(null);
  const eventsLoading = events === undefined;

  if (user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!user || user.systemRole !== 'admin') {
    return <Navigate to="/" replace />;
  }

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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Event-Verwaltung</h1>
        <p className="text-muted-foreground mt-2">
          Bestätige neue Events und greife wie ein Veranstalter auf alle Events zu.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Ort</TableHead>
              <TableHead>Veranstalter</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventsLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-center py-6">
                  Lade Events...
                </TableCell>
              </TableRow>
            ) : events?.length ? (
              events.map((event) => (
                <TableRow key={event._id}>
                  <TableCell>
                    <div className="font-medium">{event.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Sichtbarkeit: {event.visibility}
                    </div>
                  </TableCell>
                  <TableCell>{formatDateRangeDE(event.startDate, event.endDate)}</TableCell>
                  <TableCell>{event.location}</TableCell>
                  <TableCell>
                    <div className="font-medium">{event.organizerName || 'Unbekannt'}</div>
                    <div className="text-xs text-muted-foreground">
                      {event.organizerEmail || '—'}
                    </div>
                  </TableCell>
                  <TableCell>{renderStatus(event)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/events/view/${event._id}`)}
                      >
                        Verwalten
                      </Button>
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
                <TableCell colSpan={6} className="text-muted-foreground text-center py-6">
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
    </div>
  );
}
