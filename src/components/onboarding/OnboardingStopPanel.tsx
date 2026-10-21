import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';

interface OnboardingStopPanelProps {
  onCancel: () => void;
  onConfirm: () => void;
  radius?: 'lg' | 'xl';
}

export function OnboardingStopPanel({
  onCancel,
  onConfirm,
  radius = 'lg',
}: OnboardingStopPanelProps) {
  const { t } = useTranslation('onboarding');
  const radiusClass = radius === 'xl' ? 'rounded-xl' : 'rounded-lg';
  const widthClass = radius === 'xl' ? 'min-w-[320px] max-w-lg' : 'min-w-[280px] max-w-sm';

  return (
    <div
      className={`${radiusClass} ${widthClass} bg-background border border-border/70 shadow-xl dark:shadow-black/50 flex flex-col justify-between p-4 sm:p-6 w-full`}
    >
      <div>
        <h3 className="font-semibold mb-1">{t('panel.stopTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('panel.stopShort')}</p>
        <p className="text-sm text-muted-foreground">{t('panel.stopRestart')}</p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t('panel.backToTour')}
        </Button>
        <Button variant="destructive" size="sm" onClick={onConfirm}>
          {t('panel.stop')}
        </Button>
      </div>
    </div>
  );
}
