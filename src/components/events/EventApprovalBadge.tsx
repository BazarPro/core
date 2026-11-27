import { useTranslation } from 'react-i18next';
import { eventApproval } from '../../lib/eventApproval';
import { Badge } from '../ui/badge';

/**
 * Whether a public bazaar has passed the platform's check; nothing for the others.
 * `onlyOpen`: nothing once approved, e.g. next to the phase badge in lists, where a second
 * green badge says nothing new.
 */
export function EventApprovalBadge({
  event,
  onlyOpen = false,
}: {
  event: Parameters<typeof eventApproval>[0];
  onlyOpen?: boolean;
}) {
  const { t } = useTranslation('organizer');
  const approval = eventApproval(event);
  if (approval === 'rejected') {
    return <Badge variant="destructive">{t('settingsPage.rejected')}</Badge>;
  }
  if (approval === 'pending') return <Badge variant="warning">{t('settingsPage.pending')}</Badge>;
  if (approval === 'approved' && !onlyOpen) {
    return <Badge variant="success">{t('settingsPage.approved')}</Badge>;
  }
  return null;
}
