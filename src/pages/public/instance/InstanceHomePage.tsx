import { useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { Button } from '../../../components/ui/button';
import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { useInstanceConfig } from '../../../hooks/useInstanceConfig';
import { LandingEventsSection } from '../landing/components/LandingEventsSection';

/**
 * Start page of a self-hosted instance (`single` mode): the association and its
 * bazaars instead of the BazarPro marketing page.
 */
export function InstanceHomePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();
  const { name, logoUrl } = useInstanceConfig();
  const [includePast, setIncludePast] = useState(false);
  const events = usePublicQuery(api.events.get, { includePast }) || [];
  const title = name || 'Basar';

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={title}
        description={`Artikel anmelden und verkaufen beim ${title}.`}
        canonical="/"
      />

      <section className="container mx-auto px-4 py-12 md:py-20 text-center">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="mx-auto mb-6 h-20 w-auto object-contain" />
        ) : (
          <ShoppingBag className="mx-auto mb-6 h-16 w-16 text-primary" />
        )}
        <h1 className="text-3xl md:text-5xl font-bold mb-4">{title}</h1>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Melde deine Artikel online an, drucke die Etiketten aus und behalte deine Verkäufe im
          Blick.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isAuthenticated ? (
            <Button size="lg" onClick={() => navigate('/my-products')}>
              Zu meinen Artikeln
            </Button>
          ) : (
            <>
              <Button size="lg" onClick={() => navigate('/register?role=participant')}>
                Registrieren
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/login')}>
                Anmelden
              </Button>
            </>
          )}
        </div>
      </section>

      <LandingEventsSection
        events={events}
        onEventClick={(eventId) => navigate(`/public-events/${eventId}`, { state: { from: '/' } })}
        includePast={includePast}
        onIncludePastChange={setIncludePast}
        onCreateEventClick={() => navigate(isAuthenticated ? '/my-events' : '/login')}
      />

      <Footer />
    </div>
  );
}
