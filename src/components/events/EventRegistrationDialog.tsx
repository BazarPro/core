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
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

const ERROR_KEYS: Record<string, string> = {
  'Vendor limit reached': 'join.vendorLimit',
  'Invalid access code': 'join.invalidCode',
  'Not authenticated': 'join.notAuthenticated',
  'Event not found': 'join.notFound',
};

function getErrorMessage(error: ConvexError<string | { message?: string }>): string {
  const data = error.data;
  const message = typeof data === 'string' ? data : (data?.message ?? '');
  return i18n.t((ERROR_KEYS[message] ?? 'join.failed') as never, { ns: 'events' }) as string;
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
  const { t } = useTranslation('events');
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
      toast.success(t('join.joined', { event: eventTitle }));
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      const msg = error instanceof ConvexError ? getErrorMessage(error) : t('join.failed');
      setErrorMessage(msg);
      toast.error(t('join.joinFailed'), { description: msg });
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
            <DialogTitle>{t('join.title', { event: eventTitle })}</DialogTitle>
            <DialogDescription>
              {hasAccessCode && !accessCodeValid
                ? t('join.needsCode')
                : hasMissingProfileData
                  ? t('join.needsProfile')
                  : t('join.confirmQuestion')}
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
                <Label htmlFor="accessCode">{t('join.accessCode')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="accessCode"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder={t('join.codePlaceholder')}
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
                    {t('join.confirmCode')}
                  </Button>
                </div>
                {accessCodeValid === false && (
                  <p className="text-xs text-destructive">{t('join.wrongCode')}</p>
                )}
                {isDemoMode && (
                  <p className="text-xs text-muted-foreground">{t('join.demoCode')}</p>
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
                  {isJoining ? t('join.joining') : t('join.confirm')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  className="flex-1"
                  disabled={isJoining}
                >
                  {t('actions.cancel', { ns: 'common' })}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
