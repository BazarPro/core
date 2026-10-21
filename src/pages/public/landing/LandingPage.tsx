import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { useAuthState } from '../../../lib/api/react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../lib/api/functions';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { organization, softwareApplication } from '../../../lib/structuredData';
import { LandingCTA } from './components/LandingCTA';
import { LandingEventsSection } from './components/LandingEventsSection';
import { LandingFeatures } from './components/LandingFeatures';
import { LandingHero } from './components/LandingHero';
import { LandingProcess } from './components/LandingProcess';
import './landing.css';
import { useTranslation } from 'react-i18next';

export function LandingPage() {
  const [includePast, setIncludePast] = useState(false);
  const publicEvents = usePublicQuery(api.events.get, { includePast }) || [];
  const navigate = useNavigate();
  const { t } = useTranslation('landing');
  const { isAuthenticated } = useAuthState();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the texts follow the language, and t changes with it
  const jsonLd = useMemo(() => [softwareApplication(), organization()], [t]);

  const goToOrganizer = () => navigate(isAuthenticated ? '/my-events' : '/register?role=organizer');
  const goToSeller = () =>
    navigate(isAuthenticated ? '/my-products' : '/register?role=participant');

  return (
    <div className="min-h-screen overflow-x-clip bg-background selection:bg-primary selection:text-primary-foreground">
      <Seo
        title={t('seo.title')}
        description={t('seo.description')}
        canonical="/"
        jsonLd={jsonLd}
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

      <LandingFeatures />

      <LandingCTA
        isAuthenticated={!!isAuthenticated}
        onOrganizerClick={goToOrganizer}
        onSellerClick={goToSeller}
      />

      <Footer />
    </div>
  );
}
