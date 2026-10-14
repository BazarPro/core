import type { ModerationAction, ReportReason, ReportTarget } from '../../convex/constants';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  illegal: 'Rechtswidriger Inhalt (z. B. gestohlene Ware)',
  fraud: 'Betrug oder Fälschung',
  offensive: 'Beleidigend oder diskriminierend',
  personalData: 'Persönliche Daten ohne Einwilligung',
  spam: 'Spam oder Werbung',
  other: 'Sonstiges',
};

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = {
  product: 'Artikel',
  event: 'Veranstaltung',
  question: 'Frage',
  user: 'Nutzer',
};

export const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = {
  hideProduct: 'Artikel ausgeblendet',
  restoreProduct: 'Artikel wieder sichtbar',
  hideEvent: 'Veranstaltung gesperrt',
  restoreEvent: 'Sperre aufgehoben',
  deleteQuestion: 'Frage gelöscht',
  banUser: 'Nutzer gesperrt',
  unbanUser: 'Nutzer entsperrt',
  approveEvent: 'Veranstaltung freigegeben',
  rejectEvent: 'Veranstaltung abgelehnt',
  resolveReport: 'Meldung erledigt',
  dismissReport: 'Meldung abgewiesen',
};

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
