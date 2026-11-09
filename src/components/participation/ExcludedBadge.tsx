import { Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Exclusion } from '../../lib/api/types';
import { formatDateTimeDE } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

/** Marks a seller the organizer took out of the bazaar; the reason shows on hover. */
export function ExcludedBadge({
  exclusion,
  className,
}: {
  exclusion: Exclusion;
  className?: string;
}) {
  const { t } = useTranslation('organizer');
  const since = t('participation.excludedSince', { time: formatDateTimeDE(exclusion.excludedAt) });
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 gap-1 border-destructive/40 bg-destructive/5 text-destructive',
        className
      )}
      title={exclusion.reason ? `${since}: ${exclusion.reason}` : since}
    >
      <Ban className="h-3 w-3" />
      {t('participation.excluded')}
    </Badge>
  );
}
