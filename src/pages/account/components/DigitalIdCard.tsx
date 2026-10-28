import { useState, useEffect, useCallback } from 'react';
import { useApiClient, useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import {
  STEP_SECONDS,
  checkInQrValue,
  currentCodes,
  fetchOwnKeys,
  ownKeys,
  type OwnKeys,
} from '../../../lib/checkInCode';
import { isNetworkError } from '../../../lib/offlineMode';
import { Button } from '../../../components/ui/button';
import { QrCode, Eye, EyeOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../../components/ui/skeleton';

/**
 * The seller's ID QR code for intake and pickup. Online it carries the 60-second token of
 * the backend and the time-based codes of the seller's bazaars; without internet only the
 * codes, which the phone computes from its kept keys (lib/checkInCode.ts).
 */
export function DigitalIdCard() {
  const { t } = useTranslation('account');
  const client = useApiClient();
  const viewer = useQuery(api.users.viewer);
  const generateToken = useMutation(api.users.generateCheckInToken);
  const [checkInToken, setCheckInToken] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showDigitalId, setShowDigitalId] = useState(false);
  const [isGeneratingId, setIsGeneratingId] = useState(false);
  const [own, setOwn] = useState<OwnKeys | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [noKey, setNoKey] = useState(false);
  const userId = viewer?._id ?? null;

  const handleRefreshId = useCallback(async () => {
    setIsGeneratingId(true);
    try {
      const result = await generateToken();
      setCheckInToken(result.token);
      setTimeLeft(Math.floor((result.expires - Date.now()) / 1000));
    } catch (err) {
      setCheckInToken(null);
      // Offline the time-based code is enough
      if (!isNetworkError(err)) {
        console.error('Failed to generate token', err);
        toast.error(t('digitalId.loadFailed'), {
          description: getUserFacingErrorMessage(err),
        });
      }
    } finally {
      setIsGeneratingId(false);
    }
  }, [generateToken, t]);

  // The keys: fresh from the backend, else the ones kept on the device
  useEffect(() => {
    if (!showDigitalId || !userId) return;
    let active = true;
    fetchOwnKeys(client)
      .catch(() => ownKeys(userId))
      .then((keys) => {
        if (!active) return;
        setOwn(keys?.keys.length ? keys : null);
        setNoKey(!keys?.keys.length);
      })
      .catch(() => active && setNoKey(true));
    return () => {
      active = false;
    };
  }, [client, showDigitalId, userId]);

  // The codes change every STEP_SECONDS
  useEffect(() => {
    if (!showDigitalId || !own) return;
    let active = true;
    const update = () =>
      void currentCodes(own).then(
        (next) =>
          active && setCodes((previous) => (previous?.join() === next.join() ? previous : next))
      );
    update();
    const timer = setInterval(update, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [own, showDigitalId]);

  // An expired token is left out, e.g. while a slow refresh runs
  const token = timeLeft > 0 ? checkInToken : null;
  const qrValue =
    userId && codes
      ? checkInQrValue(token, userId, codes)
      : token
        ? `bazarpro://user/${token}`
        : null;
  const offlineOnly = !token && !!qrValue;

  useEffect(() => {
    if (!showDigitalId || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, showDigitalId]);

  useEffect(() => {
    if (!showDigitalId) return;
    const interval = setInterval(handleRefreshId, 45000);
    return () => clearInterval(interval);
  }, [showDigitalId, handleRefreshId]);

  const toggleIdVisibility = () => {
    if (!showDigitalId) {
      handleRefreshId();
    }
    setShowDigitalId(!showDigitalId);
  };

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden mb-8">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-medium">{t('digitalId.title')}</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleIdVisibility}
            className="text-muted-foreground hover:text-primary"
          >
            {showDigitalId ? (
              <>
                <EyeOff className="h-4 w-4 mr-2" /> {t('digitalId.hide')}
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" /> {t('digitalId.show')}
              </>
            )}
          </Button>
        </div>

        {showDigitalId ? (
          <div className="flex flex-col md:flex-row gap-8 items-center animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-white p-4 rounded-xl border-4 border-primary/10 relative">
              {/* While a new token loads the last code stays: the time-based codes work */}
              {qrValue ? (
                <QRCodeSVG value={qrValue} size={180} level="H" includeMargin={false} />
              ) : (
                <Skeleton className="h-[180px] w-[180px] rounded-lg" />
              )}
            </div>
            <div className="flex-1 space-y-4 text-center md:text-left">
              <p className="text-sm text-muted-foreground">{t('digitalId.usage')}</p>
              <div className="flex flex-col gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-full text-xs font-medium text-primary border border-primary/10 w-fit mx-auto md:mx-0">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  {offlineOnly
                    ? t('digitalId.offline', { seconds: STEP_SECONDS })
                    : t('digitalId.validFor', { seconds: Math.max(0, timeLeft) })}
                </div>
                {noKey && !checkInToken && (
                  <p className="text-xs text-destructive">{t('digitalId.noOfflineKey')}</p>
                )}
                <Button
                  variant="link"
                  size="sm"
                  className="text-[10px] h-auto p-0 text-muted-foreground uppercase tracking-widest font-semibold"
                  onClick={handleRefreshId}
                  disabled={isGeneratingId}
                >
                  {t('digitalId.refresh')}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                {t('digitalId.noScreenshot')}
              </p>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center border-2 border-dashed rounded-xl bg-muted/20">
            <Button variant="outline" onClick={toggleIdVisibility}>
              {t('digitalId.showId')}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">{t('digitalId.onlyOnSite')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
