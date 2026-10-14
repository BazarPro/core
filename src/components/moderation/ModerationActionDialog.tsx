import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { ReasonDialog } from './ReasonDialog';

export type ModerationRequest =
  | { kind: 'hideProduct'; id: Id<'products'>; label: string; reportId?: Id<'reports'> }
  | { kind: 'hideEvent'; id: Id<'events'>; label: string; reportId?: Id<'reports'> }
  | { kind: 'deleteQuestion'; id: Id<'productQuestions'>; label: string; reportId?: Id<'reports'> }
  | { kind: 'banUser'; id: Id<'users'>; label: string; reportId?: Id<'reports'> }
  | { kind: 'dismissReport'; id: Id<'reports'>; label: string };

const TEXTS: Record<
  ModerationRequest['kind'],
  { title: string; description: string; confirm: string; success: string }
> = {
  hideProduct: {
    title: 'Artikel ausblenden',
    description:
      'Der Artikel ist danach nur noch für den Verkäufer, das Event-Team und Admins sichtbar. Fragen und Preisvorschläge sind nicht mehr möglich.',
    confirm: 'Ausblenden',
    success: 'Artikel ausgeblendet',
  },
  hideEvent: {
    title: 'Veranstaltung sperren',
    description:
      'Die Veranstaltung verschwindet für Besucher und Verkäufer, niemand kann mehr beitreten. Das Veranstalter-Team kann sie weiter verwalten.',
    confirm: 'Sperren',
    success: 'Veranstaltung gesperrt',
  },
  deleteQuestion: {
    title: 'Frage löschen',
    description: 'Frage und Antwort werden endgültig gelöscht. Der Text bleibt im Protokoll.',
    confirm: 'Löschen',
    success: 'Frage gelöscht',
  },
  banUser: {
    title: 'Nutzer sperren',
    description:
      'Das Konto wird gesperrt und sofort abgemeldet. Die Person kann sich nicht mehr anmelden.',
    confirm: 'Sperren',
    success: 'Nutzer gesperrt',
  },
  dismissReport: {
    title: 'Meldung abweisen',
    description:
      'Der Inhalt bleibt sichtbar. Die meldende Person erhält deine Begründung per E-Mail.',
    confirm: 'Abweisen',
    success: 'Meldung abgewiesen',
  },
};

/** Asks for the reason of a moderation decision and carries it out. */
export function ModerationActionDialog({
  request,
  onClose,
}: {
  request: ModerationRequest | null;
  onClose: () => void;
}) {
  const hideProduct = useMutation(api.moderation.hideProduct);
  const hideEvent = useMutation(api.moderation.hideEvent);
  const deleteQuestion = useMutation(api.moderation.deleteQuestion);
  const banUser = useMutation(api.moderation.banUser);
  const resolveReport = useMutation(api.moderation.resolveReport);

  if (!request) return null;
  const texts = TEXTS[request.kind];

  const run = async (reason: string) => {
    switch (request.kind) {
      case 'hideProduct':
        await hideProduct({ productId: request.id, reason, reportId: request.reportId });
        break;
      case 'hideEvent':
        await hideEvent({ eventId: request.id, reason, reportId: request.reportId });
        break;
      case 'deleteQuestion':
        await deleteQuestion({ questionId: request.id, reason, reportId: request.reportId });
        break;
      case 'banUser':
        await banUser({ userId: request.id, reason, reportId: request.reportId });
        break;
      case 'dismissReport':
        await resolveReport({ reportId: request.id, status: 'dismissed', note: reason });
        break;
    }
  };

  return (
    <ReasonDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${texts.title}: ${request.label}`}
      description={texts.description}
      confirmLabel={texts.confirm}
      successMessage={texts.success}
      onConfirm={run}
    />
  );
}
