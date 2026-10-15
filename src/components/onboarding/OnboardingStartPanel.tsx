import { Building2, Store, X } from 'lucide-react';
import { Button } from '../ui/button';
import { useOnboarding } from '../../context/OnboardingContext';
import { useState } from 'react';
import { OnboardingStopPanel } from './OnboardingStopPanel';
import { useTranslation } from 'react-i18next';

export function OnboardingStartPanel() {
  const { t } = useTranslation('onboarding');
  const { stop, selectFlow } = useOnboarding();
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-none p-4">
      <div className="relative w-full max-w-lg bg-background text-foreground rounded-xl border border-border/70 shadow-xl dark:shadow-black/50 pointer-events-auto overflow-visible">
        {showConfirmClose ? (
          <OnboardingStopPanel
            radius="xl"
            onCancel={() => setShowConfirmClose(false)}
            onConfirm={stop}
          />
        ) : (
          <div className="p-6 sm:p-8">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setShowConfirmClose(true)}
              aria-label={t('panel.close')}
            >
              <X className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-semibold mb-1 pr-8">{t('panel.welcome')}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t('panel.intro')}
              <br />
              {t('panel.question')}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => selectFlow('participant')}
                className="group flex flex-col items-start gap-2 rounded-lg border-2 border-muted bg-muted/30 dark:bg-muted/20 p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 dark:hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Store className="h-8 w-8 text-primary" aria-hidden />
                <span className="font-semibold">{t('panel.participant')}</span>
                <span className="text-xs text-muted-foreground">{t('panel.participantHint')}</span>
              </button>
              <button
                type="button"
                onClick={() => selectFlow('organizer')}
                className="group flex flex-col items-start gap-2 rounded-lg border-2 border-muted bg-muted/30 dark:bg-muted/20 p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 dark:hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Building2 className="h-8 w-8 text-primary" aria-hidden />
                <span className="font-semibold">{t('panel.organizer')}</span>
                <span className="text-xs text-muted-foreground">{t('panel.organizerHint')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
