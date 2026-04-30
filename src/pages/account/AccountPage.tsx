import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { DigitalIdCard } from './components/DigitalIdCard';
import { ProfileCard } from './components/ProfileCard';
import { SecurityCard } from './components/SecurityCard';
import { DangerZoneCard } from './components/DangerZoneCard';
import { BackButton } from '../../components/navigation/BackButton';

export function AccountPage() {
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
          <h1 className="text-3xl font-bold tracking-tight">Kontoverwaltung</h1>
          <p className="text-muted-foreground mt-2">
            Verwalte deine persönlichen Daten, Adresse und Sicherheitseinstellungen.
          </p>
        </div>
        <DigitalIdCard />
        <ProfileCard user={user} />
        <SecurityCard providers={providers} />
        <DangerZoneCard />
      </div>
    </div>
  );
}
