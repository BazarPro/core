import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { getCurrentPath, popToPrevious } from '../../lib/navigation-history';
import { useUserRole } from '../../context/UserRoleContext';
import { useTranslation } from 'react-i18next';

interface BackButtonProps extends Omit<React.ComponentProps<typeof Button>, 'onClick'> {
  fallbackPath?: string;
  onBack?: () => void;
  title?: string;
}

export function BackButton({
  fallbackPath = '/',
  onBack,
  title,
  className,
  ...buttonProps
}: BackButtonProps) {
  const { t } = useTranslation();
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

  const ariaLabel = buttonProps['aria-label'] ?? t('actions.back');

  return (
    <Button
      {...buttonProps}
      // A ghost button lines up with the content by its text, not its invisible edge
      className={cn(buttonProps.variant === 'ghost' && '-ml-3', className)}
      aria-label={ariaLabel}
      onClick={handleBack}
    >
      <ArrowLeft className="mr-2 h-4 w-4" />
      {title ? title : t('actions.back')}
    </Button>
  );
}
