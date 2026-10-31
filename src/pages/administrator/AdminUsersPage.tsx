import { useMemo, useState } from 'react';
import { WalkInBadge } from '../../components/walkIn/WalkInBadge';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '../../lib/api/react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  ModerationActionDialog,
  type ModerationRequest,
} from '../../components/moderation/ModerationActionDialog';
import { formatDateDEShort } from '../../lib/utils';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { MODERATION_ACTION_LABELS, formatDateTime } from '../../lib/moderation';
import { AdminGuard, AdminPageHeader, FilterTabs } from './components/AdminShared';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { PastEventsHandover } from '../../components/account/PastEventsHandover';
import { TableRowsSkeleton } from '../../components/ui/loading';

/** Status name in the current language; unknown values are shown as they are. */
function statusLabel(status: string): string {
  const key = `users.status.${status}`;
  return i18n.exists(key, { ns: 'admin' })
    ? (i18n.t(key as never, { ns: 'admin' }) as string)
    : status;
}

type StatusFilter = 'all' | 'active' | 'banned' | 'admin';

export function AdminUsersPage() {
  return (
    <AdminGuard>
      <Users />
    </AdminGuard>
  );
}

function Users() {
  const { t } = useTranslation('admin');
  const users = useQuery(api.users.listUsersForAdmin, {});
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const selectedId = (params.get('user') ?? undefined) as Id<'users'> | undefined;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => {
        const status = u.status ?? 'active';
        if (filter === 'active') return status === 'active';
        if (filter === 'banned') return status === 'banned';
        if (filter === 'admin') return u.systemRole === 'admin';
        return true;
      })
      .filter(
        (u) =>
          !term ||
          (u.name ?? '').toLowerCase().includes(term) ||
          (u.email ?? '').toLowerCase().includes(term) ||
          (u.phone ?? '').includes(term)
      )
      .sort((a, b) => b._creationTime - a._creationTime);
  }, [users, search, filter]);

  const openUser = (userId: Id<'users'> | undefined) => {
    const next = new URLSearchParams(params);
    if (userId) next.set('user', userId);
    else next.delete('user');
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('users.title')} description={t('users.subtitle')} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('users.all') },
            { value: 'active', label: t('users.active') },
            { value: 'banned', label: t('users.banned') },
            { value: 'admin', label: t('users.admins') },
          ]}
        />
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('users.search')}
            className="pl-9"
            aria-label={t('users.searchLabel')}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('users.user')}</TableHead>
              <TableHead>{t('users.statusColumn')}</TableHead>
              <TableHead>{t('users.registered')}</TableHead>
              <TableHead>{t('users.lastLogin')}</TableHead>
              <TableHead className="text-right">{t('users.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users === undefined ? (
              <TableRowsSkeleton columns={5} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  {t('users.none')}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => {
                const status = u.status ?? 'active';
                return (
                  <TableRow key={u._id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        {u.name || t('users.unknown')}
                        {u.systemRole === 'admin' && <Badge>{t('users.admin')}</Badge>}
                        {u.isWalkIn && <WalkInBadge />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.email || u.phone || t('users.noContact')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          status === 'banned'
                            ? 'destructive'
                            : status === 'active'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {statusLabel(status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateDEShort(u._creationTime)}</TableCell>
                    <TableCell>{u.lastLoginAt ? formatDateDEShort(u.lastLoginAt) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openUser(u._id)}>
                        {t('users.details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {selectedId && <UserDetail userId={selectedId} onClose={() => openUser(undefined)} />}
    </div>
  );
}

function UserDetail({ userId, onClose }: { userId: Id<'users'>; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const summary = useQuery(api.moderation.getUserSummary, { userId });
  const viewer = useQuery(api.users.viewer);
  const unbanUser = useMutation(api.moderation.unbanUser);
  const [request, setRequest] = useState<ModerationRequest | null>(null);
  const [deleting, setDeleting] = useState(false);

  const facts = summary
    ? [
        { label: t('users.email'), value: summary.email ?? '—' },
        { label: t('users.phone'), value: summary.phone ?? '—' },
        { label: t('users.registered'), value: formatDateDEShort(summary.createdAt) },
        {
          label: t('users.lastLogin'),
          value: summary.lastLoginAt ? formatDateTime(summary.lastLoginAt) : '—',
        },
        {
          label: t('users.items'),
          value: summary.hiddenProductCount
            ? t('users.itemsHidden', {
                count: summary.productCount,
                hidden: summary.hiddenProductCount,
              })
            : String(summary.productCount),
        },
        { label: t('users.questions'), value: String(summary.questionCount) },
        { label: t('users.sellerEvents'), value: String(summary.sellerEventCount) },
        { label: t('users.reportsAbout'), value: String(summary.reportCount) },
      ]
    : [];

  const canBan =
    summary &&
    summary.status !== 'banned' &&
    summary.systemRole !== 'admin' &&
    viewer?._id !== summary._id;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{summary?.name ?? summary?.email ?? t('users.user')}</DialogTitle>
          <DialogDescription>
            {summary
              ? `${statusLabel(summary.status)}${summary.systemRole === 'admin' ? t('users.administrator') : ''}${summary.isWalkIn ? t('users.walkIn') : ''}`
              : t('users.loadingShort')}
          </DialogDescription>
        </DialogHeader>

        {summary && (
          <div className="space-y-6">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {facts.map((fact) => (
                <div key={fact.label} className="flex justify-between gap-4 border-b py-1.5">
                  <dt className="text-muted-foreground">{fact.label}</dt>
                  <dd className="text-right font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>

            {summary.events.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{t('users.organizerEvents')}</h3>
                <ul className="space-y-1 text-sm">
                  {summary.events.map((event) => (
                    <li key={event._id} className="flex items-center gap-2">
                      <Link to={`/events/view/${event._id}`} className="underline">
                        {event.title}
                      </Link>
                      {event.hidden && <Badge variant="destructive">{t('users.blocked')}</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to={`/admin/content?user=${summary._id}`}>{t('users.viewItems')}</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/admin/content?tab=questions&user=${summary._id}`}>
                  {t('users.viewQuestions')}
                </Link>
              </Button>
              {canBan && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    setRequest({
                      kind: 'banUser',
                      id: summary._id,
                      label: summary.name ?? summary.email ?? t('users.user'),
                    })
                  }
                >
                  {t('users.ban')}
                </Button>
              )}
              {summary.status === 'banned' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await unbanUser({ userId: summary._id });
                      toast.success(t('users.unbanned'));
                    } catch (error) {
                      toast.error(t('users.error'), {
                        description: getUserFacingErrorMessage(error),
                      });
                    }
                  }}
                >
                  {t('users.unban')}
                </Button>
              )}
              {viewer?._id !== summary._id && (
                <Button variant="destructive" size="sm" onClick={() => setDeleting(true)}>
                  {t('users.delete')}
                </Button>
              )}
            </div>

            {summary.history.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{t('users.history')}</h3>
                <ul className="space-y-2 text-sm">
                  {summary.history.map((entry) => (
                    <li key={entry._id} className="rounded-lg bg-muted/60 p-2">
                      <span className="font-medium">{MODERATION_ACTION_LABELS[entry.action]}</span>{' '}
                      <span className="text-muted-foreground">
                        {t('users.on', { date: formatDateTime(entry.createdAt) })}
                      </span>
                      {entry.reason && <p className="text-muted-foreground">{entry.reason}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
        {deleting && summary && (
          <DeleteUserDialog
            userId={summary._id}
            label={summary.name ?? summary.email ?? t('users.user')}
            onClose={(deleted) => {
              setDeleting(false);
              if (deleted) onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Deletes an account for good on request, with the checks of the account page (#168). */
function DeleteUserDialog({
  userId,
  label,
  onClose,
}: {
  userId: Id<'users'>;
  label: string;
  onClose: (deleted: boolean) => void;
}) {
  const { t } = useTranslation('admin');
  const { t: tAccount } = useTranslation('account');
  const info = useQuery(api.users.getAccountDeletionInfo, { userId });
  const deleteUser = useMutation(api.users.deleteUserForAdmin);
  const [exported, setExported] = useState(false);
  const [busy, setBusy] = useState(false);
  const pastEvents = info?.pastOrganizedEvents ?? [];

  const confirm = async () => {
    setBusy(true);
    try {
      await deleteUser({ userId, settlementExported: exported });
      toast.success(t('users.deleted'));
      onClose(true);
    } catch (error) {
      toast.error(t('users.error'), {
        description: getUserFacingErrorMessage(error, {
          messageMap: {
            ACCOUNT_IS_ORGANIZER: t('users.deleteIsOrganizer'),
            ACCOUNT_HAS_OPEN_SALES: t('users.deleteHasOpenSales'),
            ACCOUNT_IS_LAST_ADMIN: tAccount('danger.isLastAdmin'),
            ACCOUNT_ORGANIZES_PAST_EVENTS: tAccount('danger.organizesPastEvents'),
          },
        }),
      });
      setBusy(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('users.deleteTitle', { name: label })}</AlertDialogTitle>
          <AlertDialogDescription>{t('users.deleteText')}</AlertDialogDescription>
        </AlertDialogHeader>
        <PastEventsHandover
          events={pastEvents}
          exported={exported}
          onExportedChange={setExported}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy || info === undefined || (pastEvents.length > 0 && !exported)}
          >
            {t('users.deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
