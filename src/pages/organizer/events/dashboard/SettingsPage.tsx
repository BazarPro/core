import { Button } from '../../../../components/ui/button';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { useEffect } from 'react';
import { Badge } from '../../../../components/ui/badge';
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

export function SettingsPage() {
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
    return <div>Loading...</div>;
  }

  const approvalStatus = event.approvalStatus;
  const isPublic = event.visibility === 'public';
  const isRejected = isPublic && approvalStatus === 'rejected';
  const isPending = isPublic && (approvalStatus === 'pending' || event.isApproved === false);
  const isApproved = isPublic && approvalStatus === 'approved';

  const handleDelete = async () => {
    try {
      await deleteEvent({ id: eventId });
      toast.success('Veranstaltung erfolgreich gelöscht');
      navigate('/my-events');
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast.error('Löschen fehlgeschlagen', {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  return (
    <div>
      <div className="container mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-4xl">Event-Einstellungen</h1>
        </div>

        <div className="bg-card rounded-lg border p-6">
          <p className="text-muted-foreground mb-6">
            Hier kannst du alle Event-Details bearbeiten.
          </p>
          {isPublic && (
            <div className="mb-6 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="font-medium">Freigabestatus</div>
                {isApproved && <Badge variant="secondary">Freigegeben</Badge>}
                {isPending && <Badge variant="outline">Freigabe ausstehend</Badge>}
                {isRejected && <Badge variant="destructive">Abgelehnt</Badge>}
              </div>
              {isRejected && event.rejectionReason && (
                <div className="mt-2 text-sm text-muted-foreground">
                  Grund: {event.rejectionReason}
                </div>
              )}
              {isPending && (
                <div className="mt-2 text-sm text-muted-foreground">
                  Dein Event wird geprüft. Das sollte nicht lange dauern – bitte hab einen Moment
                  Geduld.
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              size="lg"
              onClick={() => navigate(`/events/edit/${eventId}`)}
              className="w-full sm:w-auto"
              disabled={!isOrganizer}
            >
              Einstellungen bearbeiten
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="lg"
                  variant="destructive"
                  className="w-full sm:w-auto"
                  disabled={!isOrganizer}
                >
                  Event löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Event wirklich löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Diese Aktion kann nicht rückgängig gemacht werden. Alle Event-Daten werden
                    dauerhaft gelöscht.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Löschen</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  );
}
