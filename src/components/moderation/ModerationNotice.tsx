import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { formatDateDEShort } from '../../lib/utils';

interface ModerationNoticeProps {
  moderation: { hiddenAt: number; reason: string } | undefined;
  /** What was hidden: an item or a whole event */
  target: 'product' | 'event';
}

/** Tells the owner and the event team why content is hidden from everybody else. */
export function ModerationNotice({ moderation, target }: ModerationNoticeProps) {
  const { t } = useTranslation('moderation');
  if (!moderation) return null;
  return (
    <Alert variant="destructive" data-testid="moderation-notice">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>
        {target === 'product' ? t('notice.productTitle') : t('notice.eventTitle')}
      </AlertTitle>
      <AlertDescription>
        <p>
          {t('notice.text', {
            date: formatDateDEShort(moderation.hiddenAt),
            reason: moderation.reason,
          })}
        </p>
        <p>{t('notice.contact')}</p>
      </AlertDescription>
    </Alert>
  );
}
