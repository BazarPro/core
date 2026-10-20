import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { ReasonDialog } from './ReasonDialog';
import { useTranslation } from 'react-i18next';

export type ModerationRequest =
  | { kind: 'hideProduct'; id: Id<'products'>; label: string; reportId?: Id<'reports'> }
  | { kind: 'hideEvent'; id: Id<'events'>; label: string; reportId?: Id<'reports'> }
  | { kind: 'deleteQuestion'; id: Id<'productQuestions'>; label: string; reportId?: Id<'reports'> }
  | { kind: 'banUser'; id: Id<'users'>; label: string; reportId?: Id<'reports'> }
  | { kind: 'dismissReport'; id: Id<'reports'>; label: string };

/** Asks for the reason of a moderation decision and carries it out. */
export function ModerationActionDialog({
  request,
  onClose,
}: {
  request: ModerationRequest | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('admin');
  const hideProduct = useMutation(api.moderation.hideProduct);
  const hideEvent = useMutation(api.moderation.hideEvent);
  const deleteQuestion = useMutation(api.moderation.deleteQuestion);
  const banUser = useMutation(api.moderation.banUser);
  const resolveReport = useMutation(api.moderation.resolveReport);

  if (!request) return null;
  const key = `moderate.${request.kind}` as const;

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
      title={t('moderate.titleWithLabel', { title: t(`${key}.title`), label: request.label })}
      description={t(`${key}.description`)}
      confirmLabel={t(`${key}.confirm`)}
      successMessage={t(`${key}.success`)}
      onConfirm={run}
    />
  );
}
