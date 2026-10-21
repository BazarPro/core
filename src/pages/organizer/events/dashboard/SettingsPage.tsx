import { Button } from '../../../../components/ui/button';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '../../../../lib/api/react';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { useEffect } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { EventSettingsSummary } from './components/EventSettingsSummary';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../../components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';

export function SettingsPage() {
  const { t } = useTranslation('organizer');
  const params = useParams();
  const eventId = params.eventId as Id<'events'>;
  const navigate = useNavigate();

  const deleteEvent = useMutation(api.events.deleteEvent);
  const event = useQuery(api.events.getEvent, { id: eventId });
  const myRoles = useQuery(api.eventRoles.getMyRolesForEvent, { eventId });
  const canManage =
    (myRoles ?? []).includes('organizer') || (myRoles ?? []).includes('coorganizer');
  const isOrganizer = (myRoles ?? []).includes('organizer');

  useEffect(() => {
    if (myRoles !== undefined && !canManage) {
      navigate('/my-events', { replace: true });
    }
  }, [myRoles, canManage, navigate]);

  if (myRoles === undefined || !event || !canManage) {
    return <div>{t('settingsPage.loading')}</div>;
  }

  const approvalStatus = event.approvalStatus;
  const isPublic = event.visibility === 'public';
  const isRejected = isPublic && approvalStatus === 'rejected';
  const isPending = isPublic && (approvalStatus === 'pending' || event.isApproved === false);
  const isApproved = isPublic && approvalStatus === 'approved';

  const handleDelete = async () => {
    try {
      await deleteEvent({ id: eventId });
      toast.success(t('settingsPage.deleted'));
      navigate('/my-events');
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast.error(t('settingsPage.deleteFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  return (
    <div>
      <div className="container mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-4xl">{t('settingsPage.title')}</h1>
        </div>

        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-2">{t('settingsPage.current')}</h2>
          <div className="mb-6">
            <EventSettingsSummary event={event} />
          </div>
          {event.endDate < Date.now() && (
            <p className="text-sm text-muted-foreground mb-4">{t('settingsPage.ended')}</p>
          )}
          {isPublic && (
            <div className="mb-6 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="font-medium">{t('settingsPage.approval')}</div>
                {isApproved && <Badge variant="secondary">{t('settingsPage.approved')}</Badge>}
                {isPending && <Badge variant="outline">{t('settingsPage.pending')}</Badge>}
                {isRejected && <Badge variant="destructive">{t('settingsPage.rejected')}</Badge>}
              </div>
              {isRejected && event.rejectionReason && (
                <div className="mt-2 text-sm text-muted-foreground">
                  {t('settingsPage.reason', { reason: event.rejectionReason })}
                </div>
              )}
              {isPending && (
                <div className="mt-2 text-sm text-muted-foreground">
                  {t('settingsPage.reviewing')}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              size="lg"
              onClick={() => navigate(`/events/edit/${eventId}`)}
              className="w-full sm:w-auto"
              disabled={!isOrganizer || event.endDate < Date.now()}
            >
              {t('settingsPage.edit')}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="lg"
                  variant="destructive"
                  className="w-full sm:w-auto"
                  disabled={!isOrganizer}
                >
                  {t('settingsPage.delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('settingsPage.deleteTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('settingsPage.deleteText')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    {t('settingsPage.deleteConfirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  );
}
