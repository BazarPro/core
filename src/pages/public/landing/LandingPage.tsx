import { useQuery, useConvexAuth } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../../convex/_generated/api';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { LandingCTA } from './components/LandingCTA';
import { LandingEventsSection } from './components/LandingEventsSection';
import { LandingFeaturesSection } from './components/LandingFeaturesSection';
import { LandingHero } from './components/LandingHero';
import { LandingRoles } from './components/LandingRoles';
import { LandingOpenSource } from './components/LandingOpenSource';
import { useState } from 'react';

export function LandingPage() {
  const [includePast, setIncludePast] = useState(false);
  const [activeRole, setActiveRole] = useState<'organizer' | 'seller'>('seller');
  const publicEvents = useQuery(api.events.get, { includePast }) || [];
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();

  const scrollToEvents = () => {
    document.getElementById('events-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToRoles = () => {
    document.getElementById('roles-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background selection:bg-primary selection:text-primary-foreground">
      <Seo
        title="BazarPro - Die moderne Plattform für Basare & Flohmärkte"
        description="Organisiere deinen Basar digital: Von der Verkäuferanmeldung bis zur automatischen Abrechnung. BazarPro macht es einfach, sicher und transparent."
        canonical="/"
      />

      <LandingHero
        onStartClick={scrollToEvents}
        onHowItWorksClick={scrollToRoles}
      />

      {/* 1. Events Section right after Hero */}
      <div id="events-section">
        <LandingEventsSection
          events={publicEvents}
          onEventClick={(eventId) => navigate(`/public-events/${eventId}`, { state: { from: '/' } })}
          includePast={includePast}
          onIncludePastChange={setIncludePast}
        />
      </div>

      {/* 2. Role Selection Section & Integrated Steps */}
      <div id="roles-section">
        <LandingRoles activeRole={activeRole} onRoleChange={setActiveRole} />
      </div>

      {/* 3. Features Section (Only for Organizer) */}
      {activeRole === 'organizer' && <LandingFeaturesSection />}

      {/* 4. Open Source */}
      <LandingOpenSource />

      {/* 5. CTA Section (Only for Organizer) */}
      {activeRole === 'organizer' && (
        <LandingCTA
          isAuthenticated={!!isAuthenticated}
          onCtaClick={() => navigate(isAuthenticated ? '/my-events' : '/register')}
        />
      )}

      <Footer />
    </div>
  );
}
