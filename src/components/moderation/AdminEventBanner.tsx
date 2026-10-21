import { Link } from 'react-router-dom';
import { useQuery } from '../../lib/api/react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api/functions';
import type { Doc } from '../../lib/api/types';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { useTranslation } from 'react-i18next';

/** Reminds administrators that they manage someone else's event. */
export function AdminEventBanner({ event }: { event: Pick<Doc<'events'>, 'organizerId'> }) {
  const { t } = useTranslation('admin');
  const viewer = useQuery(api.users.viewer);
  if (!viewer || viewer.systemRole !== 'admin' || viewer._id === event.organizerId) return null;
  return (
    <Alert variant="warning" className="mb-6" data-testid="admin-event-banner">
      <ShieldCheck className="h-4 w-4" />
      <AlertTitle>{t('banner.title')}</AlertTitle>
      <AlertDescription>
        <p>
          {t('banner.text')}{' '}
          <Link to="/admin/events" className="font-medium underline">
            {t('banner.link')}
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}
