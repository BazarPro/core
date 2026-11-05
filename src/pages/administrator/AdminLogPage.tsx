import { PageHeader } from '../../components/ui/page-header';
import { EmptyState } from '../../components/ui/empty-state';
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
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';
import { ListSkeleton, Loading } from '../../components/ui/loading';

export function AdminLogPage() {
  const { t } = useTranslation('admin');
  const entries = useQuery(api.moderation.listLog, {});

  return (
    <div className="space-y-6">
      <PageHeader title={t('log.title')} />

      {entries === undefined ? (
        <Loading>
          <ListSkeleton rows={4} />
        </Loading>
      ) : entries.length === 0 ? (
        <EmptyState title={t('log.none')} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Table stacked>
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
                  <TableCell data-inline className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </TableCell>
                  <TableCell data-inline>
                    <Badge variant="secondary">{MODERATION_ACTION_LABELS[entry.action]}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal @4xl:max-w-xs">
                    <span className="text-xs text-muted-foreground">
                      {REPORT_TARGET_LABELS[entry.targetType]}
                    </span>
                    <div className="break-words">{entry.targetLabel}</div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'whitespace-normal break-words @4xl:max-w-sm',
                      !entry.reason && '@max-4xl:hidden!'
                    )}
                  >
                    {entry.reason ?? '—'}
                  </TableCell>
                  <TableCell data-label={t('log.admin')}>{entry.adminName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
