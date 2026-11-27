import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { CalendarClock, TriangleAlert, Users } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Checkbox } from '../ui/checkbox';
import { resolveEventFeatures } from '../../shared/eventFeatures';
import { admitsPostalCode, formatRegion, postalRegion } from '../../shared/postalCodes';
import { countryName } from '../../i18n/countries';
import {
  describeRegistration,
  type Admission,
  type RegistrationEvent,
  type RegistrationInfo,
} from '../participation/registrationText';
import { useMutation, useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { toast } from 'sonner';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { ValidateProfileInformation } from './ValidateProfileInformation';
import { SellerConditions } from './SellerConditions';
import { FeeGroupChoice } from './FeeGroups';
import { RegionMapImage } from './RegionMap';
import type { SellerConditionsEvent } from '../../lib/sellerFees';
import { useTranslation } from 'react-i18next';

interface EventRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: Id<'events'>;
  eventTitle: string;
  hasAccessCode: boolean;
  /** The link of an invitation by mail, which replaces the access code */
  invitation?: string;
  /** The invitation makes a helper, who takes no seller's place */
  invitedAsHelper?: boolean;
  /**
   * Shown before the confirmation: sellers register with these fees and rules, until the
   * registration ends and while places are left
   */
  conditions: SellerConditionsEvent & RegistrationEvent;
  onSuccess: () => void;
}

export function EventRegistrationDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  hasAccessCode,
  invitation,
  invitedAsHelper,
  conditions,
  onSuccess,
}: EventRegistrationDialogProps) {
  const { t } = useTranslation('events');
  const askPrivateSeller = resolveEventFeatures(conditions).privateSellersOnly;
  const [privateSeller, setPrivateSeller] = useState(false);
  const [feeGroup, setFeeGroup] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [accessCodeValid, setAccessCodeValid] = useState<boolean | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { isDemoMode } = useFeatureFlags();
  const user = useQuery(api.users.viewer);
  const joinEvent = useMutation(api.eventSeller.joinEvent);
  // On demand, not live while typing: every wrong code counts against a limit
  const checkAccessCode = useMutation(api.eventSeller.checkAccessCode);

  const missingProfileData: string[] | undefined = useQuery(
    api.users.getMissinfProfileData,
    user
      ? {
          userId: user._id,
        }
      : 'skip'
  );
  const hasMissingProfileData = !!missingProfileData?.length;
  // Excluded by the organizer, registration closed without an invitation, or all places
  // taken: nothing to do. The team joins any time; an invitation passes a closed
  // registration, and only a helper invitation passes the seller limit.
  const exclusion = useQuery(api.eventExclusions.getMine, open && user ? { eventId } : 'skip');
  const roles = useQuery(api.eventRoles.getMyRolesForEvent, open && user ? { eventId } : 'skip');
  const team = !!roles?.some((role) => role === 'organizer' || role === 'coorganizer');
  const admission: Admission | undefined = team
    ? 'team'
    : invitation
      ? invitedAsHelper
        ? 'helperInvitation'
        : 'invitation'
      : undefined;
  const registration: RegistrationInfo = describeRegistration(conditions, Date.now(), admission);
  // Joins as a seller, so a region holds their postal code (#304); the team and helpers not
  const seller = admission !== 'team' && admission !== 'helperInvitation';
  // The team needs no access code
  const needsCode = hasAccessCode && !team;
  // A bazaar for its region (#304): an invitation and the team pass it, not the access code
  // (everyone needs that one once it is set)
  const region = postalRegion(conditions.features);
  const outsideRegion =
    !!region &&
    !admission &&
    !!user &&
    !hasMissingProfileData &&
    !admitsPostalCode(region, user.zipCode, user.country);
  const blocked = exclusion
    ? [
        t('join.excluded'),
        exclusion.reason && t('join.excludedReason', { reason: exclusion.reason }),
      ]
    : registration.blocked
      ? [
          registration.blocked,
          registration.invitationHelps ? t('join.closedHint') : t('join.fullHint'),
        ]
      : outsideRegion && [
          // The map below shows the region better than its codes
          conditions.regionMapImage
            ? t('join.regionOnlyMap')
            : t('join.regionOnly', { codes: formatRegion(region, 12, countryName) }),
          user.zipCode &&
            t('join.regionYours', {
              code: user.zipCode,
              country: countryName(user.country || 'DE'),
            }),
          t('join.regionHint'),
        ];

  const handleJoin = async () => {
    setErrorMessage(null);
    try {
      setIsJoining(true);
      await joinEvent({
        eventId,
        accessCode: needsCode ? accessCode : undefined,
        invitation,
        ...(askPrivateSeller ? { privateSeller } : {}),
        ...(feeGroup ? { feeGroupId: feeGroup } : {}),
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

  const handleCheckCode = async () => {
    setErrorMessage(null);
    try {
      setIsCheckingCode(true);
      setAccessCodeValid(await checkAccessCode({ eventId, accessCode }));
    } catch (error) {
      console.error(error);
      setErrorMessage(getUserFacingErrorMessage(error, { fallback: t('join.failed') }));
    } finally {
      setIsCheckingCode(false);
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
      <DialogContent className="flex flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-2">
          <DialogHeader>
            <DialogTitle>{t('join.title', { event: eventTitle })}</DialogTitle>
            <DialogDescription>
              {blocked
                ? t('join.notPossible')
                : needsCode && !accessCodeValid
                  ? t('join.needsCode')
                  : hasMissingProfileData
                    ? t('join.needsProfile')
                    : t('join.confirmQuestion')}
            </DialogDescription>
          </DialogHeader>
          {blocked ? (
            <div className="space-y-4 pt-4">
              <Alert>
                <AlertDescription className="space-y-1">
                  {blocked.filter(Boolean).map((line) => (
                    <p key={line as string}>{line}</p>
                  ))}
                  {/* Where the region is, for whoever wonders whether they belong to it */}
                  {outsideRegion && !exclusion && !registration.blocked && (
                    <RegionMapImage
                      image={conditions.regionMapImage}
                      className="mt-2 block aspect-[8/5] h-auto w-full rounded-md border bg-muted"
                    />
                  )}
                </AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => handleOpenChange(false)}>
                {t('close', { ns: 'common' })}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              {errorMessage && (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              {/* The region shows once, among the conditions below */}
              {(registration.until || registration.spots) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {registration.until && (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-4 w-4" />
                      {registration.until}
                    </span>
                  )}
                  {registration.spots && (
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      {registration.spots}
                    </span>
                  )}
                </div>
              )}

              {/* Check and Validate Access Code */}
              {needsCode && !accessCodeValid && (
                <div className="space-y-2">
                  <Label htmlFor="accessCode">{t('join.accessCode')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="accessCode"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      placeholder={t('join.codePlaceholder')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isCheckingCode) {
                          void handleCheckCode();
                        }
                      }}
                    />
                    <Button
                      onClick={() => void handleCheckCode()}
                      className="flex-1"
                      disabled={isJoining || isCheckingCode}
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
              {(!needsCode || accessCodeValid) && hasMissingProfileData && (
                <ValidateProfileInformation missingProfileData={missingProfileData} user={user!} />
              )}

              {/* Join Event Button */}
              {(!needsCode || accessCodeValid) && !hasMissingProfileData && (
                <SellerConditions
                  event={conditions}
                  className="rounded-lg border bg-muted/30 p-4"
                />
              )}
              {(!needsCode || accessCodeValid) && !hasMissingProfileData && (
                <FeeGroupChoice
                  event={conditions}
                  value={feeGroup}
                  onChange={setFeeGroup}
                  disabled={isJoining}
                />
              )}
              {/* The region let them in by the code in their profile: it stays, and is checked */}
              {(!needsCode || accessCodeValid) && !hasMissingProfileData && region && seller && (
                <Alert>
                  <TriangleAlert className="h-4 w-4" />
                  <AlertTitle>
                    {t('join.regionWarningTitle', { code: user?.zipCode ?? '' })}
                  </AlertTitle>
                  <AlertDescription>{t('join.regionWarning')}</AlertDescription>
                </Alert>
              )}
              {(!needsCode || accessCodeValid) && !hasMissingProfileData && askPrivateSeller && (
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
              {(!needsCode || accessCodeValid) && !hasMissingProfileData && (
                <div className="flex gap-2">
                  <Button
                    loading={isJoining}
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
