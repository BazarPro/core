import { UserX } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import i18n from '../../i18n';

/** Marks sellers the organizer created on site: no own account, no login, no emails. */
export function WalkInBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      // A plain fact, not a warning: neutral, not in tag yellow
      className={cn('shrink-0 gap-1 text-muted-foreground', className)}
      title={i18n.t('walkIn.badgeTitle', { ns: 'organizer' })}
    >
      <UserX className="h-3 w-3" />
      {i18n.t('walkIn.badge', { ns: 'organizer' })}
    </Badge>
  );
}
