import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { useUserRole } from '../../context/UserRoleContext';
import { getLastMenuPath } from '../../lib/menu-history';
import type { Id } from '../../../convex/_generated/dataModel';

interface BackToMenuButtonProps extends React.ComponentProps<typeof Button> {
  eventId?: Id<'events'>;
  label?: string;
  iconOnly?: boolean;
  fallbackPath?: string;
}

export function BackToMenuButton({
  eventId,
  label = 'Zurück',
  iconOnly = false,
  fallbackPath,
  ...buttonProps
}: BackToMenuButtonProps) {
  const navigate = useNavigate();
  const { role } = useUserRole();

  const handleBack = () => {
    const lastPath = getLastMenuPath(role, eventId);
    if (lastPath) {
      navigate(lastPath);
      return;
    }
    navigate(fallbackPath ?? (role === 'organizer' ? '/my-events' : '/my-products'));
  };

  const ariaLabel = buttonProps['aria-label'] ?? label;

  return (
    <Button {...buttonProps} aria-label={ariaLabel} onClick={handleBack}>
      <ArrowLeft className={iconOnly ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
      {!iconOnly && label}
    </Button>
  );
}
