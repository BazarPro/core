import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Badge } from '../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  MODERATION_ACTION_LABELS,
  REPORT_TARGET_LABELS,
  formatDateTime,
} from '../../lib/moderation';
import { AdminGuard, AdminPageHeader, EmptyState } from './components/AdminShared';

export function AdminLogPage() {
  return (
    <AdminGuard>
      <Log />
    </AdminGuard>
  );
}

function Log() {
  const entries = useQuery(api.moderation.listLog, {});

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Protokoll"
        description="Alle Moderationsentscheidungen mit Begründung, die neuesten zuerst."
      />

      {entries === undefined ? (
        <EmptyState>Lade Protokoll…</EmptyState>
      ) : entries.length === 0 ? (
        <EmptyState>Noch keine Einträge.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zeitpunkt</TableHead>
                <TableHead>Aktion</TableHead>
                <TableHead>Inhalt</TableHead>
                <TableHead>Begründung</TableHead>
                <TableHead>Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry._id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(entry.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{MODERATION_ACTION_LABELS[entry.action]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <span className="text-xs text-muted-foreground">
                      {REPORT_TARGET_LABELS[entry.targetType]}
                    </span>
                    <div className="break-words">{entry.targetLabel}</div>
                  </TableCell>
                  <TableCell className="max-w-sm whitespace-normal break-words">
                    {entry.reason ?? '—'}
                  </TableCell>
                  <TableCell>{entry.adminName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
