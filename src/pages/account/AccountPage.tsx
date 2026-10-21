import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { DigitalIdCard } from './components/DigitalIdCard';
import { ProfileCard } from './components/ProfileCard';
import { SecurityCard } from './components/SecurityCard';
import { DangerZoneCard } from './components/DangerZoneCard';
import { NotificationsCard } from './components/NotificationsCard';
import { BackButton } from '../../components/navigation/BackButton';
import { useTranslation } from 'react-i18next';

export function AccountPage() {
  const { t } = useTranslation('account');
  const user = useQuery(api.users.viewer);
  const providers = (useQuery(api.users.getUserProviders) as string[]) || [];

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div>
      <div className="container mx-auto max-w-2xl px-4">
        <div className="flex items-center justify-between mb-6 max-w-5xl mx-auto">
          <BackButton variant="ghost" />
        </div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
        </div>
        <DigitalIdCard />
        <ProfileCard user={user} />
        <NotificationsCard />
        <SecurityCard providers={providers} />
        <DangerZoneCard />
      </div>
    </div>
  );
}
