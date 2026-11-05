import { useTranslation } from 'react-i18next';
import { eventApproval } from '../../lib/eventApproval';
import { Badge } from '../ui/badge';

/** Whether a public bazaar has passed the platform's check; nothing for the others. */
export function EventApprovalBadge({ event }: { event: Parameters<typeof eventApproval>[0] }) {
  const { t } = useTranslation('organizer');
  const approval = eventApproval(event);
  if (approval === 'rejected') {
    return <Badge variant="destructive">{t('settingsPage.rejected')}</Badge>;
  }
  if (approval === 'pending') return <Badge variant="outline">{t('settingsPage.pending')}</Badge>;
  if (approval === 'approved') {
    return <Badge variant="secondary">{t('settingsPage.approved')}</Badge>;
  }
  return null;
}
