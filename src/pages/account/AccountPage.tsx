import { PageHeader } from '../../components/ui/page-header';
import { useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import { DigitalIdCard } from './components/DigitalIdCard';
import { ProfileCard } from './components/ProfileCard';
import { SecurityCard } from './components/SecurityCard';
import { DangerZoneCard } from './components/DangerZoneCard';
import { NotificationsCard } from './components/NotificationsCard';
import { useTranslation } from 'react-i18next';
import { ServerSwitch } from '../../native/ServerSwitch';
import { PageSkeleton } from '../../components/ui/loading';

export function AccountPage() {
  const { t } = useTranslation('account');
  const user = useQuery(api.users.viewer);
  const providers = (useQuery(api.users.getUserProviders) as string[]) || [];

  if (!user) {
    return <PageSkeleton variant="form" />;
  }

  return (
    <div className="page-narrow space-y-6 pb-12">
      <PageHeader title={t('title')} />
      <DigitalIdCard />
      <ProfileCard user={user} />
      <NotificationsCard />
      <SecurityCard providers={providers} />
      <DangerZoneCard />
      <ServerSwitch />
    </div>
  );
}
