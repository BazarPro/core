import { useQuery, useConvexAuth } from 'convex/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../../convex/_generated/api';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { LandingAudiences } from './components/LandingAudiences';
import { LandingCTA } from './components/LandingCTA';
import { LandingEventsSection } from './components/LandingEventsSection';
import { LandingFeaturesSection } from './components/LandingFeaturesSection';
import { LandingHero } from './components/LandingHero';
import { LandingOpenSource } from './components/LandingOpenSource';
import { LandingProcess } from './components/LandingProcess';
import './landing.css';

export function LandingPage() {
  const [includePast, setIncludePast] = useState(false);
  const publicEvents = useQuery(api.events.get, { includePast }) || [];
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();

  const goToOrganizer = () => navigate(isAuthenticated ? '/my-events' : '/register?role=organizer');
  const goToSeller = () =>
    navigate(isAuthenticated ? '/my-products' : '/register?role=participant');

  return (
    <div className="min-h-screen overflow-x-clip bg-background selection:bg-primary selection:text-primary-foreground">
      <Seo
        title="BazarPro - Second-Hand-Basare digital organisieren"
        description="Verkäufer erfassen Artikel online und drucken QR-Etiketten, an der Kasse wird per Smartphone gescannt, die Abrechnung entsteht automatisch. Open Source und kostenlos."
        canonical="/"
      />

      <LandingHero
        isAuthenticated={!!isAuthenticated}
        onOrganizerClick={goToOrganizer}
        onSellerClick={goToSeller}
      />

      <LandingProcess />

      <div id="events-section" className="scroll-mt-16">
        <LandingEventsSection
          events={publicEvents}
          onEventClick={(eventId) =>
            navigate(`/public-events/${eventId}`, { state: { from: '/' } })
          }
          includePast={includePast}
          onIncludePastChange={setIncludePast}
          onCreateEventClick={goToOrganizer}
        />
      </div>

      <LandingAudiences onOrganizerClick={goToOrganizer} onSellerClick={goToSeller} />

      <LandingFeaturesSection />

      <LandingOpenSource />

      <LandingCTA isAuthenticated={!!isAuthenticated} onCtaClick={goToOrganizer} />

      <Footer />
    </div>
  );
}
