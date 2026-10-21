import { UserX } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import i18n from '../../i18n';

/** Marks sellers the organizer created on site: no own account, no login, no emails. */
export function WalkInBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 gap-1 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
        className
      )}
      title={i18n.t('walkIn.badgeTitle', { ns: 'organizer' })}
    >
      <UserX className="h-3 w-3" />
      {i18n.t('walkIn.badge', { ns: 'organizer' })}
    </Badge>
  );
}
