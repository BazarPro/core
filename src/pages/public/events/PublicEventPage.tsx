import { useEffect, useState } from 'react';
import { Plus, Eye, Check, Tag } from 'lucide-react';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../../convex/_generated/api';

import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import type { Id } from '../../../../convex/_generated/dataModel';
import { EventRegistrationDialog } from '../../../components/events/EventRegistrationDialog';
import { EventHero } from '../../../components/EventHero';
import { EventPageSidebar } from '../../organizer/events/components/EventPageSidebar';
import { SafeMarkdown } from '../../../components/markdown/SafeMarkdown';
import { Seo } from '../../../components/seo/Seo';
import { buildSeoDescription, formatDateRange, toAbsoluteUrl } from '../../../lib/seo';
import { BackButton } from '../../../components/navigation/BackButton';
import { ShareButtons } from '../../../components/ui/shareButtons';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PostRegistrationSuccessDialog } from '../../../components/events/PostRegistrationSuccessDialog';

/**
 *  Main Landingpage for a Public Event
 */

interface PublicEventLandingProps {
  eventId: string | null;
  onNavigate: (page: string, state?: unknown) => void;
  onViewProducts: (eventId: string) => void;
}

export function PublicEventLanding({
  eventId,
  onNavigate,
  onViewProducts,
}: PublicEventLandingProps) {
  const { isAuthenticated } = useConvexAuth();
  const [showRegistrationDialog, setShowRegistrationDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const event = useQuery(
    api.events.getPublicEventForViewer,
    eventId ? { id: eventId as Id<'events'> } : 'skip'
  );
  const coverImageUrls = useQuery(
    api.products.getImageUrls,
    event?.coverImage ? { storageIds: [event.coverImage] } : 'skip'
  );
  const isSeller = useQuery(
    api.eventSeller.isEventSellerForEvent,
    eventId ? { eventId: eventId as Id<'events'> } : 'skip'
  );

  const currentPage = location.pathname;

  useEffect(() => {
    if (!event || !isAuthenticated) return;
    if (isSeller === undefined) return;

    const shouldAutoOpenJoinDialog = searchParams.get('openJoinDialog') === '1';
    if (!shouldAutoOpenJoinDialog) return;

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('openJoinDialog');
    const nextSearch = nextSearchParams.toString();

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );

    if (isSeller) {
      onNavigate('my-products', { eventSelectEventId: event._id });
      return;
    }

    setShowRegistrationDialog(true);
  }, [event, isAuthenticated, isSeller, location.pathname, navigate, onNavigate, searchParams]);

  if (!eventId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Seo title="Veranstaltung nicht gefunden | BazarPro" noIndex={true} />
        <p className="text-muted-foreground">Keine Veranstaltungs-ID angegeben.</p>
      </div>
    );
  }

  if (event === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Seo title="Veranstaltung laedt | BazarPro" />
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Seo title="Veranstaltung nicht gefunden | BazarPro" noIndex={true} />
        <p className="text-muted-foreground">Veranstaltung nicht gefunden.</p>
      </div>
    );
  }

  const coverImageUrl = coverImageUrls?.[0];
  const dateRange = formatDateRange(event.startDate, event.endDate);
  const description = buildSeoDescription(
    event.description,
    `Event in ${event.location} am ${dateRange}.`
  );
  const canonical = `/public-events/${event._id}`;
  const canonicalUrl = toAbsoluteUrl(canonical) ?? canonical;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description,
    startDate: new Date(event.startDate).toISOString(),
    endDate: new Date(event.endDate).toISOString(),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: event.location,
      address: event.location,
    },
    url: canonicalUrl,
    ...(coverImageUrl ? { image: [coverImageUrl] } : {}),
  };

  const isPast = event.endDate < Date.now();

  const handleJoinAsVendor = async () => {
    if (isPast) return;

    if (!isAuthenticated) {
      onNavigate(`register?joinEventId=${encodeURIComponent(event._id)}`);
      return;
    }

    if (isSeller) {
      onNavigate('my-products', { eventSelectEventId: event._id });
      return;
    }

    setShowRegistrationDialog(true);
  };

  return (
    <div>
      <Seo
        title={`${event.title} in ${event.location} | BazarPro`}
        description={description}
        canonical={canonical}
        image={coverImageUrl}
        jsonLd={jsonLd}
        jsonLdId={`event-jsonld-${event._id}`}
      />

      <div className="flex items-center justify-between mb-6 max-w-5xl mx-auto">
        <BackButton variant="ghost" />
        <ShareButtons url={currentPage} title={event.title} variant="ghost" />
      </div>

      <div className="max-w-5xl mx-auto">
        <EventHero
          title={event.title}
          coverImage={event.coverImage}
          startDate={event.startDate}
          endDate={event.endDate}
          location={event.location}
          isPast={isPast}
        />

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Button
            size="lg"
            className="flex-1 h-auto py-3 md:h-10 md:py-2"
            onClick={() => onViewProducts(event._id)}
          >
            <Eye className="mr-2 h-5 w-5" />
            Angebote ansehen
          </Button>
          {!isPast && (
            <Button
              size="lg"
              variant={isSeller ? 'secondary' : 'outline'}
              className="flex-1 h-auto py-3 md:h-10 md:py-2"
              onClick={handleJoinAsVendor}
            >
              {isSeller ? <Check className="mr-2 h-5 w-5" /> : <Plus className="mr-2 h-5 w-5" />}
              {isSeller ? 'Bereits beigetreten - Angebote verwalten' : 'Als Verkäufer beitreten'}
            </Button>
          )}
          {isPast && isSeller && (
            <Button
              size="lg"
              variant="secondary"
              className="flex-1 h-auto py-3 md:h-10 md:py-2"
              disabled
            >
              <Check className="mr-2 h-5 w-5" />
              Veranstaltung beendet
            </Button>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-card rounded-lg border p-6 md:p-8">
              <SafeMarkdown
                content={event.description}
                className="text-foreground/90 leading-7 
                    [&_p]:mb-6 [&_p:last-child]:mb-0 
                    [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:mb-6 [&_ol]:mb-6 [&_li]:ml-5 [&_li]:mb-2
                    [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4 
                    [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-4 
                    [&_h3]:text-xl [&_h3]:font-medium [&_h3]:mt-6 [&_h3]:mb-3 
                    [&_hr]:my-10 [&_hr]:border-border/60
                    [&_strong]:font-semibold [&_strong]:text-foreground"
              />
            </div>

            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-2xl font-normal mb-4">Kategorien</h2>
              <div className="flex flex-wrap gap-2">
                {event.categoryLabels?.map((category: string) => (
                  <Badge key={category} variant="secondary">
                    <Tag className="mr-1 h-3 w-3" />
                    {category}
                  </Badge>
                ))}
              </div>
            </div>

            {event.services.length > 0 && (
              <div className="bg-card rounded-lg border p-6">
                <h2 className="text-2xl  font-normal mb-4">Zusätzliche Services</h2>
                <div className="flex flex-wrap gap-2">
                  {event.services.map((service: string) => (
                    <Badge key={service} variant="outline">
                      {service}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {event.eventMapImageUrl && (
              <div className="bg-card rounded-lg border p-6">
                <h2 className="text-2xl font-normal mb-4">Lageplan</h2>
                <a
                  href={event.eventMapImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border overflow-hidden hover:opacity-95 transition-opacity"
                >
                  <img
                    src={event.eventMapImageUrl}
                    alt={`Lageplan für ${event.title}`}
                    className="w-full h-auto object-cover"
                    loading="lazy"
                  />
                </a>
              </div>
            )}
          </div>
          <EventPageSidebar event={event} />
        </div>

        <EventRegistrationDialog
          open={showRegistrationDialog}
          onOpenChange={setShowRegistrationDialog}
          eventId={event._id}
          eventTitle={event.title}
          hasAccessCode={!!event.accessCode}
          onSuccess={() => setShowSuccessDialog(true)}
        />

        {showSuccessDialog && (
          <PostRegistrationSuccessDialog
            open={showSuccessDialog}
            onOpenChange={setShowSuccessDialog}
            eventTitle={event.title}
            eventId={event._id}
          />
        )}
      </div>
    </div>
  );
}
