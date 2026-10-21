import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Plus, Tag } from 'lucide-react';
import { useQuery, useAuthState } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';

import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import type { Id } from '../../../lib/api/types';
import { EventRegistrationDialog } from '../../../components/events/EventRegistrationDialog';
import { EventHero } from '../../../components/EventHero';
import { EventPageSidebar } from '../../organizer/events/components/EventPageSidebar';
import { SafeMarkdown } from '../../../components/markdown/SafeMarkdown';
import { EventProductPreview } from '../../../components/events/EventProductPreview';
import { Seo } from '../../../components/seo/Seo';
import { buildSeoDescription, formatDateRange, toAbsoluteUrl } from '../../../lib/seo';
import { BackButton } from '../../../components/navigation/BackButton';
import { ShareButtons } from '../../../components/ui/shareButtons';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PostRegistrationSuccessDialog } from '../../../components/events/PostRegistrationSuccessDialog';
import { AdminModerationBox } from '../../../components/moderation/AdminModerationBox';
import { ModerationNotice } from '../../../components/moderation/ModerationNotice';
import { ReportButton } from '../../../components/moderation/ReportDialog';
import { Footer } from '../../../components/layout/Footer';
import { useInstanceConfig } from '../../../hooks/useInstanceConfig';
import { SellerBroadcasts } from '../../../components/broadcasts/SellerBroadcasts';
import { useTranslation } from 'react-i18next';
import { serviceLabel } from '../../../i18n/services';

/**
 *  Main Landingpage for a Public Event
 */

interface PublicEventLandingProps {
  eventId: string | null;
  onNavigate: (page: string, state?: unknown) => void;
}

export function PublicEventLanding({ eventId, onNavigate }: PublicEventLandingProps) {
  const { isAuthenticated } = useAuthState();
  const [showRegistrationDialog, setShowRegistrationDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const navigate = useNavigate();
  const { brand, isSingle } = useInstanceConfig();
  const { t } = useTranslation(['events', 'common']);
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const event = usePublicQuery(
    api.events.getPublicEventForViewer,
    eventId ? { id: eventId as Id<'events'> } : 'skip'
  );
  const coverImageUrls = usePublicQuery(
    api.products.getImageUrls,
    event?.coverImage ? { storageIds: [event.coverImage] } : 'skip'
  );
  const sellerNumber = useQuery(
    api.sellerNumbers.getMySellerNumber,
    isAuthenticated && eventId ? { eventId: eventId as Id<'events'> } : 'skip'
  );
  const isSeller = useQuery(
    api.eventSeller.isEventSellerForEvent,
    eventId ? { eventId: eventId as Id<'events'> } : 'skip'
  );

  const currentPage = location.pathname;

  // After signing up to join, the page opens the join dialog once. The URL parameter is
  // taken away at once, so a reload does not open the dialog again.
  const [joinDialogRequested, setJoinDialogRequested] = useState(false);
  useEffect(() => {
    if (searchParams.get('openJoinDialog') !== '1') return;
    setJoinDialogRequested(true);
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
  }, [location.pathname, navigate, searchParams]);

  useEffect(() => {
    if (!joinDialogRequested || !event || !isAuthenticated) return;
    if (isSeller === undefined) return;
    setJoinDialogRequested(false);

    if (isSeller) {
      onNavigate('my-products', { eventSelectEventId: event._id });
      return;
    }

    setShowRegistrationDialog(true);
  }, [event, isAuthenticated, isSeller, joinDialogRequested, onNavigate]);

  if (!eventId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Seo title={t('page.notFoundTitle', { brand })} noIndex={true} />
        <p className="text-muted-foreground">{t('page.noId')}</p>
      </div>
    );
  }

  if (event === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Seo title={t('page.loadingTitle', { brand })} />
        <p className="text-muted-foreground">{t('common:actions.loading')}</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Seo title={t('page.notFoundTitle', { brand })} noIndex={true} />
        <p className="text-muted-foreground">{t('page.notFound')}</p>
      </div>
    );
  }

  const coverImageUrl = coverImageUrls?.[0];
  const dateRange = formatDateRange(event.startDate, event.endDate);
  const description = buildSeoDescription(
    event.description,
    t('page.seoFallback', { location: event.location, date: dateRange })
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
  const isRunning = event.startDate <= Date.now() && !isPast;

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
        title={`${event.title} in ${event.location} | ${brand}`}
        description={description}
        canonical={canonical}
        image={coverImageUrl}
        jsonLd={jsonLd}
        jsonLdId={`event-jsonld-${event._id}`}
      />

      <div className="flex items-center justify-between mb-6 max-w-5xl mx-auto">
        {/* On a self-hosted instance this page is the start page: nothing to go back to */}
        {isSingle ? <span /> : <BackButton variant="ghost" />}
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
          maxHeightClassName="min-h-[340px] md:min-h-[400px]"
        >
          {isSeller ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span className="inline-flex items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white shadow-lg sm:self-auto">
                <Check className="h-4 w-4" />
                {isPast ? t('page.soldHere') : t('page.sellingHere')}
                {sellerNumber
                  ? ` · ${t('common:sellerNumberShort', { number: sellerNumber })}`
                  : ''}
              </span>
              {!isPast && (
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/40 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
                  onClick={handleJoinAsVendor}
                >
                  {t('page.myProducts')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            !isPast && (
              <Button
                size="lg"
                className="bg-white font-semibold text-primary shadow-lg hover:bg-white/90"
                onClick={handleJoinAsVendor}
              >
                <Plus className="mr-2 h-5 w-5" />
                {t('page.join')}
              </Button>
            )
          )}
        </EventHero>

        <div className="mb-6 space-y-4 empty:hidden">
          <ModerationNotice moderation={event.moderation} target="event" />
          <AdminModerationBox
            target={{
              type: 'event',
              id: event._id,
              label: event.title,
              hidden: !!event.moderation,
            }}
          />
        </div>

        {isSeller && (
          <div className="mb-6">
            <SellerBroadcasts eventId={event._id} />
          </div>
        )}

        <EventProductPreview eventId={event._id} isRunning={isRunning} />

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
              <h2 className="text-2xl font-normal mb-4">{t('page.categories')}</h2>
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
                <h2 className="text-2xl  font-normal mb-4">{t('page.services')}</h2>
                <div className="flex flex-wrap gap-2">
                  {event.services.map((service: string) => (
                    <Badge key={service} variant="outline">
                      {serviceLabel(service)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {event.eventMapImageUrl && (
              <div className="bg-card rounded-lg border p-6">
                <h2 className="text-2xl font-normal mb-4">{t('page.map')}</h2>
                <a
                  href={event.eventMapImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border overflow-hidden hover:opacity-95 transition-opacity"
                >
                  <img
                    src={event.eventMapImageUrl}
                    alt={t('page.mapAlt', { title: event.title })}
                    className="w-full h-auto object-cover"
                    loading="lazy"
                  />
                </a>
              </div>
            )}
            <ReportButton targetType="event" targetId={event._id} label={t('page.report')} />
          </div>
          <EventPageSidebar event={event} conditions={event} />
        </div>

        <EventRegistrationDialog
          open={showRegistrationDialog}
          onOpenChange={setShowRegistrationDialog}
          eventId={event._id}
          eventTitle={event.title}
          hasAccessCode={!!event.accessCode}
          conditions={event}
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
      {/* Impressum, Datenschutz and AGB; the event page is the start page of a self-hosted instance */}
      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
