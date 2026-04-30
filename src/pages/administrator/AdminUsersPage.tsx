import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Navigate } from 'react-router-dom';
import { useState } from 'react';
import type { Id } from '../../../convex/_generated/dataModel';
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
import { formatDateDEShort } from '../../lib/utils';

export function AdminUsersPage() {
  const user = useQuery(api.users.viewer);
  const isAdmin = user?.systemRole === 'admin';
  const users = useQuery(api.users.listUsersForAdmin, isAdmin ? {} : 'skip');
  const setUserStatus = useMutation(api.users.setUserStatusForAdmin);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const usersLoading = users === undefined;

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

  const handleToggleBan = async (userId: string, isBanned: boolean) => {
    setProcessingUserId(userId);
    try {
      await setUserStatus({
        userId: userId as Id<'users'>,
        status: isBanned ? 'active' : 'banned',
      });
    } finally {
      setProcessingUserId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nutzerverwaltung</h1>
        <p className="text-muted-foreground mt-2">
          Verwalte als Administrator alle Accounts und Zugriffsrechte.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nutzer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rolle</TableHead>
              <TableHead>Letzter Login</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center py-6">
                  Lade Nutzer...
                </TableCell>
              </TableRow>
            ) : users?.length ? (
              users.map((u) => {
                const status = u.status ?? 'active';
                const isBanned = status === 'banned';
                const isAdminUser = u.systemRole === 'admin';
                const statusLabel: Record<string, string> = {
                  active: 'Aktiv',
                  inactive: 'Inaktiv',
                  deleted: 'Gelöscht',
                  banned: 'Gesperrt',
                  notVerified: 'Nicht verifiziert',
                };
                const statusVariant =
                  status === 'banned'
                    ? 'destructive'
                    : status === 'active'
                      ? 'secondary'
                      : 'outline';
                return (
                  <TableRow key={u._id}>
                    <TableCell>
                      <div className="font-medium">{u.name || 'Unbekannt'}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email || u.phone || 'Keine Kontaktdaten'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant}>{statusLabel[status] ?? status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.systemRole === 'admin' ? 'default' : 'outline'}>
                        {u.systemRole === 'admin' ? 'Admin' : 'User'}
                      </Badge>
                    </TableCell>
                    <TableCell>{u.lastLoginAt ? formatDateDEShort(u.lastLoginAt) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={isBanned ? 'secondary' : 'destructive'}
                        size="sm"
                        disabled={processingUserId === u._id || isAdminUser}
                        onClick={() => handleToggleBan(u._id, isBanned)}
                      >
                        {isBanned ? 'Entsperren' : 'Sperren'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center py-6">
                  Keine Nutzer gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
