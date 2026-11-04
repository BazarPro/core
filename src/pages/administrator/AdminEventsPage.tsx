import { ReasonDialog } from '../../components/moderation/ReasonDialog';
import { SearchInput } from '../../components/ui/search-input';
import { PageHeader } from '../../components/ui/page-header';
import { useMutation, useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
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
import { toast } from 'sonner';
import {
  ModerationActionDialog,
  type ModerationRequest,
} from '../../components/moderation/ModerationActionDialog';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { FilterTabs } from './components/AdminShared';
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
    } catch (error) {
      toast.error(t('events.error'), { description: getUserFacingErrorMessage(error) });
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
      <PageHeader title={t('events.title')} />

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
        <SearchInput
          className="w-full lg:max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('events.search')}
          aria-label={t('events.searchLabel')}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Table stacked>
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
                  <TableCell className="min-w-[12rem] whitespace-normal">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-xs text-muted-foreground">{event.location}</div>
                    {event.moderation && (
                      <div className="text-xs text-destructive">
                        {t('events.blockedReason', { reason: event.moderation.reason })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell
                    className="min-w-[9rem] whitespace-normal"
                    data-label={t('events.date')}
                  >
                    {formatDateRangeDE(event.startDate, event.endDate)}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{event.organizerName || t('events.unknown')}</div>
                    <div className="text-xs text-muted-foreground break-all">
                      {event.organizerEmail || '—'}
                    </div>
                  </TableCell>
                  <TableCell>{renderStatus(event)}</TableCell>
                  <TableCell className="min-w-[16rem] text-right">
                    <div className="flex flex-wrap justify-end gap-1 max-md:justify-start">
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
                            onClick={() => setRejectEventId(event._id)}
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

      <ReasonDialog
        open={!!rejectEventId}
        onOpenChange={(open) => !open && setRejectEventId(null)}
        title={t('events.rejectTitle')}
        description={t('events.rejectText')}
        confirmLabel={t('events.rejectTitle')}
        onConfirm={async (reason) => {
          await rejectEvent({ eventId: rejectEventId!, reason });
        }}
        successMessage={t('events.rejected')}
      />

      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
