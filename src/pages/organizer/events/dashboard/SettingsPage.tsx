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
import { Alert, AlertDescription, AlertTitle } from '../../../../components/ui/alert';
import { Trash2 } from 'lucide-react';
import { EditEventForm } from '../EditEventForm';
import { EventSettingsSummary } from './components/EventSettingsSummary';
import { useTranslation } from 'react-i18next';
import { PageSkeleton } from '../../../../components/ui/loading';
import { Tabs, TabsContent } from '../../../../components/ui/tabs';
import { isSettingsTab, useSettingsTab } from '../settingsTabs';
import { SettingsTabsList } from '../SettingsTabsList';

export function SettingsPage() {
  const { t } = useTranslation('organizer');
  const params = useParams();
  const eventId = params.eventId as Id<'events'>;
  const navigate = useNavigate();

  const deleteEvent = useMutation(api.events.deleteEvent);
  const event = useQuery(api.events.getEvent, { id: eventId });
  const { isLoading, canManage, isOrganizer, isAdmin } = useEventAccess(eventId);
  const [tab, openTab] = useSettingsTab();

  useEffect(() => {
    if (!isLoading && !canManage) {
      navigate('/', { replace: true });
    }
  }, [isLoading, canManage, navigate]);

  if (event === null) {
    return (
      <div className="page-narrow">
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

  // Approved: a quiet badge beside the title. Waiting or rejected: a notice on top
  const approvalBadge = approvalState && <EventApprovalBadge event={event} />;
  const approvalNotice = (isRejected || isPending) && (
    <Alert variant={isRejected ? 'destructive' : 'default'}>
      <AlertTitle>{t('settingsPage.approval')}</AlertTitle>
      <AlertDescription>
        {isRejected
          ? event.rejectionReason && t('settingsPage.reason', { reason: event.rejectionReason })
          : t('settingsPage.reviewing')}
      </AlertDescription>
    </Alert>
  );

  // The last thing on the page, quiet: deleting is rare and cannot be undone
  const deletion = isOrganizer && (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div>
        <h2 className="font-sans text-sm font-semibold">{t('settingsPage.deleteTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('settingsPage.deleteHint')}</p>
      </div>
      <ConfirmDialog
        trigger={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
            {t('settingsPage.delete')}
          </Button>
        }
        title={t('settingsPage.deleteTitle')}
        description={t('settingsPage.deleteText')}
        confirmLabel={t('settingsPage.deleteConfirm')}
        onConfirm={handleDelete}
        destructive
      />
    </section>
  );

  // Who may change the settings changes them right here; everybody else reads them.
  // The platform admin also after the end, to correct mistakes
  if (isOrganizer && (event.endDate >= Date.now() || isAdmin)) {
    return (
      <EditEventForm headerAside={approvalBadge} notice={approvalNotice} dangerZone={deletion} />
    );
  }

  return (
    <div className="page-narrow space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {t('settingsPage.title')}
            {approvalBadge && <span className="text-base font-normal">{approvalBadge}</span>}
          </span>
        }
      />
      {approvalNotice}
      {event.endDate < Date.now() && (
        <p className="text-sm text-muted-foreground">{t('settingsPage.ended')}</p>
      )}
      {/* The same tabs as when editing, to read one part at a time */}
      <Tabs
        value={tab}
        onValueChange={(value) => isSettingsTab(value) && openTab(value)}
        className="gap-5"
      >
        <SettingsTabsList directSale={event.features?.directSale} />
        <TabsContent value={tab} className="space-y-6">
          <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
            <EventSettingsSummary event={event} section={tab} />
          </div>
          {tab === 'basics' && deletion}
        </TabsContent>
      </Tabs>
    </div>
  );
}
