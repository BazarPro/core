import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { Checkbox } from '../ui/checkbox';
import { resolveEventFeatures } from '../../shared/eventFeatures';
import { useMutation, useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { toast } from 'sonner';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { ValidateProfileInformation } from './ValidateProfileInformation';
import { SellerConditions } from './SellerConditions';
import type { SellerConditionsEvent } from '../../lib/sellerFees';
import { useTranslation } from 'react-i18next';

interface EventRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: Id<'events'>;
  eventTitle: string;
  hasAccessCode: boolean;
  /** Shown before the confirmation: sellers register with these fees and rules */
  conditions: SellerConditionsEvent;
  onSuccess: () => void;
}

export function EventRegistrationDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  hasAccessCode,
  conditions,
  onSuccess,
}: EventRegistrationDialogProps) {
  const { t } = useTranslation('events');
  const askPrivateSeller = resolveEventFeatures(conditions).privateSellersOnly;
  const [privateSeller, setPrivateSeller] = useState(false);
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
      await joinEvent({
        eventId,
        accessCode: hasAccessCode ? accessCode : undefined,
        ...(askPrivateSeller ? { privateSeller } : {}),
      });
      toast.success(t('join.joined', { event: eventTitle }));
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      const msg = getUserFacingErrorMessage(error, { fallback: t('join.failed') });
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
        <div className="flex-1 space-y-4 overflow-y-auto p-2">
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
              <SellerConditions event={conditions} className="rounded-lg border bg-muted/30 p-4" />
            )}
            {(!hasAccessCode || accessCodeValid) && !hasMissingProfileData && askPrivateSeller && (
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <Checkbox
                  id="join-private-seller"
                  checked={privateSeller}
                  onCheckedChange={(checked: boolean | string) => setPrivateSeller(!!checked)}
                  className="mt-0.5"
                />
                <Label htmlFor="join-private-seller" className="cursor-pointer font-normal">
                  {t('join.privateSeller')}
                </Label>
              </div>
            )}
            {(!hasAccessCode || accessCodeValid) && !hasMissingProfileData && (
              <div className="flex gap-2">
                <Button
                  onClick={handleJoin}
                  className="flex-1"
                  disabled={isJoining || (askPrivateSeller && !privateSeller)}
                >
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
