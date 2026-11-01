import { useMutation, useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
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
import type { Doc, Id } from '../../lib/api/types';
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
import { useTranslation } from 'react-i18next';
import { TableRowsSkeleton } from '../../components/ui/loading';
import { formatEventPlace } from '../../shared/eventJsonLd';

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
  const { t } = useTranslation('admin');
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
          formatEventPlace(event).toLowerCase().includes(term) ||
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
      toast.success(t('events.unblocked'));
    } catch (error) {
      toast.error(t('events.error'), { description: getUserFacingErrorMessage(error) });
    }
  };

  const handleApprove = async (eventId: string) => {
    setProcessingEventId(eventId);
    try {
      await approveEvent({ eventId: eventId as Id<'events'> });
      toast.success(t('events.approved'));
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
      toast.success(t('events.rejected'));
      setRejectDialogOpen(false);
    } finally {
      setProcessingEventId(null);
    }
  };

  const renderStatus = (event: AdminEvent) => {
    if (event.moderation) {
      return <Badge variant="destructive">{t('events.statusBlocked')}</Badge>;
    }
    if (event.visibility !== 'public') {
      return <Badge variant="outline">{t('events.statusPrivate')}</Badge>;
    }
    if (event.approvalStatus === 'approved') {
      return <Badge variant="secondary">{t('events.statusApproved')}</Badge>;
    }
    if (event.approvalStatus === 'rejected') {
      return <Badge variant="destructive">{t('events.statusRejected')}</Badge>;
    }
    return <Badge variant="outline">{t('events.statusPending')}</Badge>;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('events.title')} description={t('events.subtitle')} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('events.all') },
            { value: 'pending', label: t('events.pending'), count: pendingCount },
            { value: 'running', label: t('events.running') },
            { value: 'upcoming', label: t('events.upcoming') },
            { value: 'hidden', label: t('events.hidden') },
          ]}
        />
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('events.search')}
            className="pl-9"
            aria-label={t('events.searchLabel')}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('events.event')}</TableHead>
              <TableHead>{t('events.date')}</TableHead>
              <TableHead>{t('events.organizer')}</TableHead>
              <TableHead>{t('events.status')}</TableHead>
              <TableHead className="text-right">{t('events.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventsLoading ? (
              <TableRowsSkeleton columns={5} />
            ) : filtered.length ? (
              filtered.map((event) => (
                <TableRow key={event._id}>
                  <TableCell className="min-w-[14rem]">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-xs text-muted-foreground">{event.location}</div>
                    {event.moderation && (
                      <div className="text-xs text-destructive">
                        {t('events.blockedReason', { reason: event.moderation.reason })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[10rem]">
                    {formatDateRangeDE(event.startDate, event.endDate)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{event.organizerName || t('events.unknown')}</div>
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
                        {t('events.manage')}
                      </Button>
                      {event.visibility === 'public' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/public-events/${event._id}`)}
                        >
                          {t('events.view')}
                        </Button>
                      )}
                      {event.moderation ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRestore(event._id)}
                        >
                          {t('events.unblock')}
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
                          {t('events.block')}
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
                            {t('events.approve')}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={processingEventId === event._id}
                            onClick={() => openRejectDialog(event._id)}
                          >
                            {t('events.reject')}
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
                  {t('events.none')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('events.rejectTitle')}</DialogTitle>
            <DialogDescription>{t('events.rejectText')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={t('events.rejectPlaceholder')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {t('actions.cancel', { ns: 'common' })}
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || !!processingEventId}
            >
              {t('events.rejectTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
