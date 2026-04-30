import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { ValidateProfileInformation } from './ValidateProfileInformation';

const ERROR_MESSAGES: Record<string, string> = {
  'Vendor limit reached': 'Das Teilnehmerlimit für Verkäufer ist erreicht.',
  'Invalid access code': 'Ungültiger Zugangscode. Bitte prüfe den Code vom Veranstalter.',
  'Not authenticated': 'Bitte melde dich an, um dich für die Veranstaltung anzumelden.',
  'Event not found': 'Die Veranstaltung wurde nicht gefunden.',
};

function getErrorMessage(error: ConvexError<string | { message?: string }>): string {
  const data = error.data;
  const message = typeof data === 'string' ? data : (data?.message ?? '');
  return (
    ERROR_MESSAGES[message] ??
    'Fehler beim Beitreten der Veranstaltung. Bitte versuche es später erneut.'
  );
}

interface EventRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: Id<'events'>;
  eventTitle: string;
  hasAccessCode: boolean;
  onSuccess: () => void;
}

export function EventRegistrationDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  hasAccessCode,
  onSuccess,
}: EventRegistrationDialogProps) {
  const [accessCode, setAccessCode] = useState('');
  const [accessCodeValid, setAccessCodeValid] = useState<boolean | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { isDemoMode } = useFeatureFlags();
  const user = useQuery(api.users.viewer);
  const joinEvent = useMutation(api.eventSeller.joinEvent);
  const checkAccessCode = useQuery(api.eventSeller.checkAccessCode, {
    eventId,
    accessCode: accessCode,
  });

  const missingProfileData: string[] | undefined = useQuery(
    api.users.getMissinfProfileData,
    user
      ? {
          userId: user._id,
        }
      : 'skip'
  );
  const hasMissingProfileData = !!missingProfileData?.length;

  const handleJoin = async () => {
    setErrorMessage(null);
    try {
      setIsJoining(true);
      await joinEvent({ eventId, accessCode: hasAccessCode ? accessCode : undefined });
      toast.success(`Erfolgreich für ${eventTitle} angemeldet`);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      const msg =
        error instanceof ConvexError
          ? getErrorMessage(error)
          : 'Fehler beim Beitreten der Veranstaltung. Bitte versuche es später erneut.';
      setErrorMessage(msg);
      toast.error('Anmeldung fehlgeschlagen', { description: msg });
    } finally {
      setIsJoining(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setErrorMessage(null);
    onOpenChange(open);
    setAccessCode('');
    setAccessCodeValid(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[95vh] flex flex-col p-8">
        <div className="flex-1 space-y-4 p-2">
          <DialogHeader>
            <DialogTitle>Anmeldung für {eventTitle}</DialogTitle>
            <DialogDescription>
              {hasAccessCode && !accessCodeValid
                ? 'Diese Veranstaltung erfordert einen Zugangscode für Verkäufer. Bitte gib den Code ein, den du vom Veranstalter erhalten hast.'
                : hasMissingProfileData
                  ? 'Bitte geb deine Kontaktdaten ein, um dich für die Veranstaltung anzumelden. Die Daten werden in deinem Profil gespeichert.'
                  : 'Willst du dich als Verkäufer für das Event anmelden?'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {errorMessage && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {/* Check and Validate Access Code */}
            {hasAccessCode && !accessCodeValid && (
              <div className="space-y-2">
                <Label htmlFor="accessCode">Zugangscode</Label>
                <div className="flex gap-2">
                  <Input
                    id="accessCode"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder="Code eingeben..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setAccessCodeValid(checkAccessCode ?? false);
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      setAccessCodeValid(checkAccessCode ?? false);
                    }}
                    className="flex-1"
                    disabled={isJoining}
                  >
                    Code bestätigen
                  </Button>
                </div>
                {accessCodeValid === false && (
                  <p className="text-xs text-destructive">Eingegebener Code ist falsch!</p>
                )}
                {isDemoMode && (
                  <p className="text-xs text-muted-foreground">Demo: Verwende "DEMO" als Code</p>
                )}
              </div>
            )}

            {/* Check Account Info */}
            {(!hasAccessCode || accessCodeValid) && hasMissingProfileData && (
              <ValidateProfileInformation missingProfileData={missingProfileData} user={user!} />
            )}

            {/* Join Event Button */}
            {(!hasAccessCode || accessCodeValid) && !hasMissingProfileData && (
              <div className="flex gap-2">
                <Button onClick={handleJoin} className="flex-1" disabled={isJoining}>
                  {isJoining ? 'Melde an...' : 'Anmelden bestätigen'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  className="flex-1"
                  disabled={isJoining}
                >
                  Abbrechen
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
