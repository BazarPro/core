import { HelpCircle } from 'lucide-react';
import { useConvexAuth } from 'convex/react';
import { useOnboarding } from '../../context/OnboardingContext';
import { Button } from '../ui/button';

export function OnboardingLauncher() {
  const { isAuthenticated, isLoading } = useConvexAuth();
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
        aria-label={isActive ? 'Onboarding beenden' : 'Onboarding starten'}
      >
        <HelpCircle className="h-5 w-5" />
      </Button>
    </div>
  );
}

