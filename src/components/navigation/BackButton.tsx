import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { getCurrentPath, popToPrevious } from '../../lib/navigation-history';
import { useUserRole } from '../../context/UserRoleContext';

interface BackButtonProps extends Omit<React.ComponentProps<typeof Button>, 'onClick'> {
  fallbackPath?: string;
  onBack?: () => void;
  title?: string;
}

export function BackButton({ fallbackPath = '/', onBack, title, ...buttonProps }: BackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useUserRole();

  const isPublicPath = (pathname: string) => {
    if (
      pathname === '/' ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/password-reset-request') ||
      pathname.startsWith('/features') ||
      pathname.startsWith('/pricing') ||
      pathname.startsWith('/about') ||
      pathname.startsWith('/contact') ||
      pathname.startsWith('/privacy') ||
      pathname.startsWith('/terms') ||
      pathname.startsWith('/imprint') ||
      pathname.startsWith('/public-events') ||
      pathname.startsWith('/products/view')
    ) {
      return true;
    }
    return false;
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    const currentPath = getCurrentPath(location);
    const useRole = isPublicPath(location.pathname) ? null : role;
    const prev = popToPrevious(currentPath, useRole);
    if (prev) {
      navigate(prev);
      return;
    }
    navigate(fallbackPath);
  };

  const ariaLabel = buttonProps['aria-label'] ?? 'Zurück';

  return (
    <Button {...buttonProps} aria-label={ariaLabel} onClick={handleBack}>
      <ArrowLeft className="mr-2 h-4 w-4" />
      {title ? title : 'Zurück'}
    </Button>
  );
}
