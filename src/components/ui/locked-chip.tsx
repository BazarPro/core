import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** "Gesperrt" beside the title of fields that cannot be changed right now. */
export function LockedChip() {
  const { t } = useTranslation('organizer');
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Lock className="size-3" aria-hidden />
      {t('form.locked')}
    </span>
  );
}
