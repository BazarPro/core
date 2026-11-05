import { PageHeader } from '../../../../components/ui/page-header';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { Button } from '../../../../components/ui/button';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '../../../../lib/api/react';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../lib/api/types';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { useEffect } from 'react';
import { EventApprovalBadge } from '../../../../components/events/EventApprovalBadge';
import { useEventAccess } from '../../../../hooks/useEventAccess';
import { eventApproval } from '../../../../lib/eventApproval';
import { FormSection } from '../../../../components/ui/form-section';
import { EditEventForm } from '../EditEventForm';
import { EventSettingsSummary } from './components/EventSettingsSummary';
import { useTranslation } from 'react-i18next';
import { PageSkeleton } from '../../../../components/ui/loading';

export function SettingsPage() {
  const { t } = useTranslation('organizer');
  const params = useParams();
  const eventId = params.eventId as Id<'events'>;
  const navigate = useNavigate();

  const deleteEvent = useMutation(api.events.deleteEvent);
  const event = useQuery(api.events.getEvent, { id: eventId });
  const { isLoading, canManage, isOrganizer } = useEventAccess(eventId);

  useEffect(() => {
    if (!isLoading && !canManage) {
      navigate('/', { replace: true });
    }
  }, [isLoading, canManage, navigate]);

  if (event === null) {
    return (
      <div className="container mx-auto">
        <h1 className="text-4xl mb-2">{t('dashboard.notFound')}</h1>
      </div>
    );
  }
  if (isLoading || !event || !canManage) {
    return <PageSkeleton variant="form" />;
  }

  const approvalState = eventApproval(event);
  const isRejected = approvalState === 'rejected';
  const isPending = approvalState === 'pending';

  const handleDelete = async () => {
    try {
      await deleteEvent({ id: eventId });
      toast.success(t('settingsPage.deleted'));
      navigate('/');
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast.error(t('settingsPage.deleteFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  const approval = approvalState && (
    <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="font-medium">{t('settingsPage.approval')}</div>
        <EventApprovalBadge event={event} />
      </div>
      {isRejected && event.rejectionReason && (
        <div className="mt-2 text-sm text-muted-foreground">
          {t('settingsPage.reason', { reason: event.rejectionReason })}
        </div>
      )}
      {isPending && (
        <div className="mt-2 text-sm text-muted-foreground">{t('settingsPage.reviewing')}</div>
      )}
    </div>
  );

  const deletion = isOrganizer && (
    <FormSection title={t('settingsPage.deleteTitle')} description={t('settingsPage.deleteHint')}>
      <ConfirmDialog
        trigger={<Button variant="destructive">{t('settingsPage.delete')}</Button>}
        title={t('settingsPage.deleteTitle')}
        description={t('settingsPage.deleteText')}
        confirmLabel={t('settingsPage.deleteConfirm')}
        onConfirm={handleDelete}
        destructive
      />
    </FormSection>
  );

  // Who may change the settings changes them right here; everybody else reads them
  if (isOrganizer && event.endDate >= Date.now()) {
    return (
      <EditEventForm
        after={
          <div className="mt-8 space-y-6">
            {approval}
            {deletion}
          </div>
        }
      />
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('settingsPage.title')} />
      {event.endDate < Date.now() && (
        <p className="text-sm text-muted-foreground">{t('settingsPage.ended')}</p>
      )}
      <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <EventSettingsSummary event={event} />
      </div>
      {approval}
      {deletion}
    </div>
  );
}
