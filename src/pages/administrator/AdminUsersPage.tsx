import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
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

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  inactive: 'Inaktiv',
  deleted: 'Gelöscht',
  banned: 'Gesperrt',
  notVerified: 'Nicht verifiziert',
};

type StatusFilter = 'all' | 'active' | 'banned' | 'admin';

export function AdminUsersPage() {
  return (
    <AdminGuard>
      <Users />
    </AdminGuard>
  );
}

function Users() {
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
      <AdminPageHeader
        title="Nutzer"
        description="Konten suchen, ihre Inhalte ansehen und bei Verstößen sperren."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Alle' },
            { value: 'active', label: 'Aktiv' },
            { value: 'banned', label: 'Gesperrt' },
            { value: 'admin', label: 'Admins' },
          ]}
        />
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, E-Mail oder Telefon"
            className="pl-9"
            aria-label="Nutzer suchen"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nutzer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Registriert</TableHead>
              <TableHead>Letzter Login</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users === undefined ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Lade Nutzer…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Keine Nutzer gefunden.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => {
                const status = u.status ?? 'active';
                return (
                  <TableRow key={u._id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        {u.name || 'Unbekannt'}
                        {u.systemRole === 'admin' && <Badge>Admin</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.email || u.phone || 'Keine Kontaktdaten'}
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
                        {STATUS_LABELS[status] ?? status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateDEShort(u._creationTime)}</TableCell>
                    <TableCell>{u.lastLoginAt ? formatDateDEShort(u.lastLoginAt) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openUser(u._id)}>
                        Details
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
  const summary = useQuery(api.moderation.getUserSummary, { userId });
  const viewer = useQuery(api.users.viewer);
  const unbanUser = useMutation(api.moderation.unbanUser);
  const [request, setRequest] = useState<ModerationRequest | null>(null);

  const facts = summary
    ? [
        { label: 'E-Mail', value: summary.email ?? '—' },
        { label: 'Telefon', value: summary.phone ?? '—' },
        { label: 'Registriert', value: formatDateDEShort(summary.createdAt) },
        {
          label: 'Letzter Login',
          value: summary.lastLoginAt ? formatDateTime(summary.lastLoginAt) : '—',
        },
        {
          label: 'Artikel',
          value: `${summary.productCount}${summary.hiddenProductCount ? ` (${summary.hiddenProductCount} ausgeblendet)` : ''}`,
        },
        { label: 'Fragen', value: String(summary.questionCount) },
        { label: 'Teilnahmen als Verkäufer', value: String(summary.sellerEventCount) },
        { label: 'Meldungen zum Konto', value: String(summary.reportCount) },
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
          <DialogTitle>{summary?.name ?? summary?.email ?? 'Nutzer'}</DialogTitle>
          <DialogDescription>
            {summary
              ? `${STATUS_LABELS[summary.status] ?? summary.status}${summary.systemRole === 'admin' ? ' · Administrator' : ''}${summary.isWalkIn ? ' · Vor Ort angelegt' : ''}`
              : 'Lade…'}
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
                <h3 className="text-sm font-semibold">Veranstaltungen als Veranstalter</h3>
                <ul className="space-y-1 text-sm">
                  {summary.events.map((event) => (
                    <li key={event._id} className="flex items-center gap-2">
                      <Link to={`/events/view/${event._id}`} className="underline">
                        {event.title}
                      </Link>
                      {event.hidden && <Badge variant="destructive">Gesperrt</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to={`/admin/content?user=${summary._id}`}>Artikel ansehen</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/admin/content?tab=questions&user=${summary._id}`}>Fragen ansehen</Link>
              </Button>
              {canBan && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    setRequest({
                      kind: 'banUser',
                      id: summary._id,
                      label: summary.name ?? summary.email ?? 'Nutzer',
                    })
                  }
                >
                  Konto sperren
                </Button>
              )}
              {summary.status === 'banned' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await unbanUser({ userId: summary._id });
                      toast.success('Konto entsperrt');
                    } catch (error) {
                      toast.error('Fehler', { description: getUserFacingErrorMessage(error) });
                    }
                  }}
                >
                  Konto entsperren
                </Button>
              )}
            </div>

            {summary.history.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Verlauf</h3>
                <ul className="space-y-2 text-sm">
                  {summary.history.map((entry) => (
                    <li key={entry._id} className="rounded-lg bg-muted/60 p-2">
                      <span className="font-medium">{MODERATION_ACTION_LABELS[entry.action]}</span>{' '}
                      <span className="text-muted-foreground">
                        am {formatDateTime(entry.createdAt)}
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
      </DialogContent>
    </Dialog>
  );
}
