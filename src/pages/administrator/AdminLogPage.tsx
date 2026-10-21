import { useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
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
import { useTranslation } from 'react-i18next';

export function AdminLogPage() {
  return (
    <AdminGuard>
      <Log />
    </AdminGuard>
  );
}

function Log() {
  const { t } = useTranslation('admin');
  const entries = useQuery(api.moderation.listLog, {});

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('log.title')} description={t('log.subtitle')} />

      {entries === undefined ? (
        <EmptyState>{t('log.loading')}</EmptyState>
      ) : entries.length === 0 ? (
        <EmptyState>{t('log.none')}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('log.time')}</TableHead>
                <TableHead>{t('log.action')}</TableHead>
                <TableHead>{t('log.content')}</TableHead>
                <TableHead>{t('log.reason')}</TableHead>
                <TableHead>{t('log.admin')}</TableHead>
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
