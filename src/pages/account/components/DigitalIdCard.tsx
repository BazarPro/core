import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import { Button } from '../../../components/ui/button';
import { QrCode, Eye, EyeOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../../components/ui/skeleton';

export function DigitalIdCard() {
  const { t } = useTranslation('account');
  const generateToken = useMutation(api.users.generateCheckInToken);
  const [checkInToken, setCheckInToken] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showDigitalId, setShowDigitalId] = useState(false);
  const [isGeneratingId, setIsGeneratingId] = useState(false);

  const handleRefreshId = useCallback(async () => {
    setIsGeneratingId(true);
    try {
      const result = await generateToken();
      setCheckInToken(result.token);
      setTimeLeft(Math.floor((result.expires - Date.now()) / 1000));
    } catch (err) {
      console.error('Failed to generate token', err);
      toast.error(t('digitalId.loadFailed'), {
        description: getUserFacingErrorMessage(err),
      });
    } finally {
      setIsGeneratingId(false);
    }
  }, [generateToken, t]);

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
              {checkInToken && !isGeneratingId ? (
                <QRCodeSVG
                  value={`bazarpro://user/${checkInToken}`}
                  size={180}
                  level="H"
                  includeMargin={false}
                />
              ) : (
                <Skeleton className="h-[180px] w-[180px] rounded-lg" />
              )}
            </div>
            <div className="flex-1 space-y-4 text-center md:text-left">
              <p className="text-sm text-muted-foreground">{t('digitalId.usage')}</p>
              <div className="flex flex-col gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-full text-xs font-medium text-primary border border-primary/10 w-fit mx-auto md:mx-0">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  {t('digitalId.validFor', { seconds: Math.max(0, timeLeft) })}
                </div>
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
