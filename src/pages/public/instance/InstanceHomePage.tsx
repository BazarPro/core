import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { api } from '../../../lib/api/functions';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { Button } from '../../../components/ui/button';
import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { useAuthState, useQuery } from '../../../lib/api/react';
import { useInstanceConfig } from '../../../hooks/useInstanceConfig';
import { LandingEventsSection } from '../landing/components/LandingEventsSection';
import { useTranslation } from 'react-i18next';

/**
 * Start page of a self-hosted instance (`single` mode): the association with its
 * bazaars. Admins can make it lead straight to the running or next bazaar instead.
 */
export function InstanceHomePage() {
  const config = useQuery(api.instance.getConfig, {});
  const current = useQuery(api.instance.getCurrentEvent, {});
  if (config === undefined || current === undefined) {
    return null;
  }
  if (config.startPage === 'currentEvent' && current) {
    return <Navigate to={`/public-events/${current._id}`} replace />;
  }
  // Without a running or upcoming bazaar, show the past ones
  return <InstanceWelcome showPast={!current} />;
}

/** `/browse-events` of a self-hosted instance: there is only the current bazaar. */
export function CurrentBazaarRedirect() {
  const current = useQuery(api.instance.getCurrentEvent, {});
  if (current === undefined) {
    return null;
  }
  return <Navigate to={current ? `/public-events/${current._id}` : '/'} replace />;
}

function InstanceWelcome({ showPast }: { showPast: boolean }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthState();
  const { name, logoUrl } = useInstanceConfig();
  const [includePast, setIncludePast] = useState(showPast);
  const events = usePublicQuery(api.events.get, { includePast }) || [];
  const { t } = useTranslation('landing');
  const title = name || t('instance.fallbackName');

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={title}
        description={t('instance.seoDescription', { name: title })}
        canonical="/"
      />

      <section className="container mx-auto px-4 py-12 md:py-20 text-center">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="mx-auto mb-6 h-20 w-auto object-contain" />
        ) : (
          <ShoppingBag className="mx-auto mb-6 h-16 w-16 text-primary" />
        )}
        <h1 className="text-3xl md:text-5xl font-bold mb-4">{title}</h1>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">{t('instance.text')}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isAuthenticated ? (
            <Button size="lg" onClick={() => navigate('/my-products')}>
              {t('instance.myProducts')}
            </Button>
          ) : (
            <>
              <Button size="lg" onClick={() => navigate('/register?role=participant')}>
                {t('instance.register')}
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/login')}>
                {t('instance.login')}
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
