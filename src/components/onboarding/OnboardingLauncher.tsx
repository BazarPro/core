import { HelpCircle } from 'lucide-react';
import { useAuthState } from '../../lib/api/react';
import { useOnboarding } from '../../context/OnboardingContext';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';

export function OnboardingLauncher() {
  const { t } = useTranslation('onboarding');
  const { isAuthenticated, isLoading } = useAuthState();
  const { isActive, start, stop } = useOnboarding();

  if (isLoading || !isAuthenticated) {
    return null;
  }

  const handleClick = () => {
    if (isActive) {
      stop();
    } else {
      start();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[998]">
      <Button
        type="button"
        size="icon"
        variant={isActive ? 'secondary' : 'outline'}
        onClick={handleClick}
        className="rounded-full shadow-md"
        aria-label={isActive ? t('panel.launcherStop') : t('panel.launcherStart')}
      >
        <HelpCircle className="h-5 w-5" />
      </Button>
    </div>
  );
}
