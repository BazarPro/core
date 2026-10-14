import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { ReportStatus } from '../../../convex/constants';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  ModerationActionDialog,
  type ModerationRequest,
} from '../../components/moderation/ModerationActionDialog';
import { REPORT_REASON_LABELS, REPORT_TARGET_LABELS, formatDateTime } from '../../lib/moderation';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { AdminGuard, AdminPageHeader, EmptyState, FilterTabs } from './components/AdminShared';

export function AdminReportsPage() {
  return (
    <AdminGuard>
      <Reports />
    </AdminGuard>
  );
}

function Reports() {
  const [status, setStatus] = useState<ReportStatus>('open');
  const reports = useQuery(api.moderation.listReports, { status });
  const counts = useQuery(api.moderation.getMenuCounts, {});
  const restoreProduct = useMutation(api.moderation.restoreProduct);
  const restoreEvent = useMutation(api.moderation.restoreEvent);
  const unbanUser = useMutation(api.moderation.unbanUser);
  const resolveReport = useMutation(api.moderation.resolveReport);
  const [request, setRequest] = useState<ModerationRequest | null>(null);

  const attempt = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error('Fehler', { description: getUserFacingErrorMessage(error) });
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Meldungen"
        description="Von Nutzern gemeldete Inhalte. Entscheide mit Begründung; Verkäufer und Meldende werden per E-Mail informiert."
      />

      <FilterTabs
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: 'Offen', count: counts?.openReports },
          { value: 'resolved', label: 'Erledigt' },
          { value: 'dismissed', label: 'Abgewiesen' },
        ]}
      />

      {reports === undefined ? (
        <EmptyState>Lade Meldungen…</EmptyState>
      ) : reports.length === 0 ? (
        <EmptyState>
          {status === 'open' ? 'Keine offenen Meldungen. Alles erledigt!' : 'Keine Meldungen.'}
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => {
            const { target } = report;
            const label = target.label;
            return (
              <li
                key={report._id}
                className="space-y-4 rounded-xl border bg-card p-5 shadow-sm"
                data-testid="admin-report"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{REPORT_TARGET_LABELS[report.targetType]}</Badge>
                      <Badge variant="secondary">{REPORT_REASON_LABELS[report.reason]}</Badge>
                      {report.reportCount > 1 && (
                        <Badge variant="destructive">{report.reportCount} Meldungen</Badge>
                      )}
                      {target.isRestricted && target.exists && (
                        <Badge variant="destructive">Eingeschränkt</Badge>
                      )}
                    </div>
                    <p className="break-words text-lg font-semibold">
                      {target.path ? (
                        <Link to={target.path} className="hover:underline" target="_blank">
                          {label}
                          <ExternalLink className="ml-1 inline h-4 w-4 text-muted-foreground" />
                        </Link>
                      ) : (
                        label
                      )}
                    </p>
                    {target.ownerName && (
                      <p className="text-sm text-muted-foreground">
                        Verantwortlich:{' '}
                        {target.ownerId ? (
                          <Link to={`/admin/users?user=${target.ownerId}`} className="underline">
                            {target.ownerName}
                          </Link>
                        ) : (
                          target.ownerName
                        )}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{formatDateTime(report.createdAt)}</div>
                    <div>von {report.reporterLabel}</div>
                  </div>
                </div>

                <blockquote className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm">
                  {report.details}
                </blockquote>

                {report.status !== 'open' ? (
                  <p className="text-sm text-muted-foreground">
                    {report.status === 'resolved' ? 'Erledigt' : 'Abgewiesen'}
                    {report.resolvedAt ? ` am ${formatDateTime(report.resolvedAt)}` : ''}
                    {report.resolverName ? ` von ${report.resolverName}` : ''}
                    {report.resolutionNote ? `: ${report.resolutionNote}` : ''}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {target.exists && !target.isRestricted && (
                      <>
                        {report.targetType === 'product' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              setRequest({
                                kind: 'hideProduct',
                                id: report.targetId as Id<'products'>,
                                label,
                                reportId: report._id,
                              })
                            }
                          >
                            Artikel ausblenden
                          </Button>
                        )}
                        {report.targetType === 'event' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              setRequest({
                                kind: 'hideEvent',
                                id: report.targetId as Id<'events'>,
                                label,
                                reportId: report._id,
                              })
                            }
                          >
                            Veranstaltung sperren
                          </Button>
                        )}
                        {report.targetType === 'question' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              setRequest({
                                kind: 'deleteQuestion',
                                id: report.targetId as Id<'productQuestions'>,
                                label,
                                reportId: report._id,
                              })
                            }
                          >
                            Frage löschen
                          </Button>
                        )}
                        {report.targetType === 'user' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              setRequest({
                                kind: 'banUser',
                                id: report.targetId as Id<'users'>,
                                label,
                                reportId: report._id,
                              })
                            }
                          >
                            Nutzer sperren
                          </Button>
                        )}
                      </>
                    )}
                    {target.exists && target.isRestricted && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            attempt(
                              () =>
                                resolveReport({
                                  reportId: report._id,
                                  status: 'resolved',
                                  note: 'Der Inhalt wurde bereits eingeschränkt.',
                                }),
                              'Meldung erledigt'
                            )
                          }
                        >
                          Als erledigt markieren
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            attempt(async () => {
                              const id = report.targetId;
                              if (report.targetType === 'product') {
                                await restoreProduct({ productId: id as Id<'products'> });
                              } else if (report.targetType === 'event') {
                                await restoreEvent({ eventId: id as Id<'events'> });
                              } else if (report.targetType === 'user') {
                                await unbanUser({ userId: id as Id<'users'> });
                              }
                            }, 'Einschränkung aufgehoben')
                          }
                        >
                          Einschränkung aufheben
                        </Button>
                      </>
                    )}
                    {!target.exists && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          attempt(
                            () =>
                              resolveReport({
                                reportId: report._id,
                                status: 'resolved',
                                note: 'Der Inhalt wurde inzwischen gelöscht.',
                              }),
                            'Meldung erledigt'
                          )
                        }
                      >
                        Als erledigt markieren
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRequest({ kind: 'dismissReport', id: report._id, label })}
                    >
                      Kein Verstoß
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
