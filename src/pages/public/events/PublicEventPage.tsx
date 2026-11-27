import { EmptyState } from '../../../components/ui/empty-state';
import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Ban,
  CalendarClock,
  Check,
  Clock,
  MapPin,
  Plus,
  Tag,
  Users,
} from 'lucide-react';
import { useMutation, useQuery, useAuthState } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';

import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import type { Id } from '../../../lib/api/types';
import { EventRegistrationDialog } from '../../../components/events/EventRegistrationDialog';
import { EventHero } from '../../../components/EventHero';
import { EventPageSidebar } from '../../organizer/events/components/EventPageSidebar';
import { SafeMarkdown } from '../../../components/markdown/SafeMarkdown';
import { EventProductPreview } from '../../../components/events/EventProductPreview';
import { ConditionFacts } from '../../../components/events/SellerConditions';
import { Seo } from '../../../components/seo/Seo';
import {
  buildSeoDescription,
  DEFAULT_SEO_IMAGE,
  formatDateRange,
  toAbsoluteUrl,
} from '../../../lib/seo';
import { eventJsonLd, eventTown, formatEventPlace } from '../../../shared/eventJsonLd';
import { BackButton } from '../../../components/navigation/BackButton';
import { EventLoginHint } from '../../../components/events/EventLoginHint';
import { ShareButtons } from '../../../components/ui/shareButtons';
import { PageSkeleton } from '../../../components/ui/loading';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PostRegistrationSuccessDialog } from '../../../components/events/PostRegistrationSuccessDialog';
import { AdminModerationBox } from '../../../components/moderation/AdminModerationBox';
import { ModerationNotice } from '../../../components/moderation/ModerationNotice';
import { ReportButton } from '../../../components/moderation/ReportDialog';
import { Footer } from '../../../components/layout/Footer';
import { useInstanceConfig } from '../../../hooks/useInstanceConfig';
import { SellerBroadcasts } from '../../../components/broadcasts/SellerBroadcasts';
import { MyRejections } from '../../../components/participation/MyRejections';
import { useTranslation } from 'react-i18next';
import { eventCategoryNames } from '../../../i18n/categories';
import { useServiceLabel } from '../../../i18n/services';
import { useNowPassing } from '../../../hooks/useNowPassing';
import { registrationTimes, resolveEventFeatures } from '../../../shared/eventFeatures';
import { dateLocale } from '../../../i18n/format';
import i18n from '../../../i18n';
import { describeRegistration } from '../../../components/participation/registrationText';
import { eventPhase } from '../../../shared/eventPhase';
import { RegionMapLink } from '../../../components/events/RegionMap';

/**
 *  Main Landingpage for a Public Event
 */

interface PublicEventLandingProps {
  eventId: string | null;
  onNavigate: (page: string, state?: unknown) => void;
}

export function PublicEventLanding({ eventId, onNavigate }: PublicEventLandingProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuthState();
  const [showRegistrationDialog, setShowRegistrationDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const navigate = useNavigate();
  const { brand, isSingle } = useInstanceConfig();
  const { t } = useTranslation(['events', 'common']);
  const serviceLabel = useServiceLabel();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const event = usePublicQuery(
    api.events.getPublicEventForViewer,
    eventId ? { id: eventId as Id<'events'> } : 'skip'
  );
  const categoryList = usePublicQuery(api.categories.getAllCategories, {});
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
  const exclusion = useQuery(
    api.eventExclusions.getMine,
    isAuthenticated && eventId ? { eventId: eventId as Id<'events'> } : 'skip'
  );
  // Organizer and helpers join as sellers at any time, also while the registration is closed
  const myRoles = useQuery(
    api.eventRoles.getMyRolesForEvent,
    isAuthenticated && eventId ? { eventId: eventId as Id<'events'> } : 'skip'
  );
  const isTeam = !!myRoles?.some((role) => role === 'organizer' || role === 'coorganizer');
  // Read here, e.g. from the mail: the marker at "Basare" goes
  const markSeen = useMutation(api.notifications.markNoticesSeen);
  const unreadNotices = useQuery(
    api.notifications.getUnreadNoticeCounts,
    isAuthenticated ? {} : 'skip'
  );
  const unreadExclusion = !!exclusion && (unreadNotices?.participation ?? 0) > 0;
  useEffect(() => {
    if (!unreadExclusion || !eventId) return;
    void markSeen({ area: 'participation', eventId: eventId as Id<'events'> }).catch(() => {});
  }, [unreadExclusion, eventId, markSeen]);

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
  // Start and end show without a reload; the event data does not change then
  // The registration opens and closes the same way
  const now = useNowPassing([
    event?.startDate,
    event?.endDate,
    ...(event ? registrationTimes(event) : []),
  ]);

  if (!eventId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Seo title={t('page.notFoundTitle', { brand })} noIndex={true} />
        <p className="text-muted-foreground">{t('page.noId')}</p>
      </div>
    );
  }

  // While the session loads the answer is that of a visitor; it follows once it is known
  if (event === undefined || (!event && authLoading)) {
    return (
      <>
        <Seo title={t('page.loadingTitle', { brand })} />
        <PageSkeleton variant="detail" className="px-4 py-8" />
      </>
    );
  }

  if (!event) {
    return (
      <div className="container mx-auto px-4 py-20">
        <Seo title={t('page.notFoundTitle', { brand })} noIndex={true} />
        <EmptyState title={t('page.notFound')}>
          {!isAuthenticated && <EventLoginHint />}
          <Button onClick={() => navigate('/')}>{t('offers.backHome')}</Button>
        </EmptyState>
      </div>
    );
  }

  const coverImageUrl = coverImageUrls?.[0];
  const dateRange = formatDateRange(event.startDate, event.endDate);
  const description = buildSeoDescription(
    event.description,
    t('page.seoFallback', { location: eventTown(event), date: dateRange })
  );
  const canonical = `/public-events/${event._id}`;
  const canonicalUrl = toAbsoluteUrl(canonical) ?? canonical;
  const jsonLd = eventJsonLd({
    title: event.title,
    description,
    location: event.location,
    street: event.street,
    postalCode: event.postalCode,
    city: event.city,
    country: event.country,
    startDate: event.startDate,
    endDate: event.endDate,
    url: canonicalUrl,
    image: coverImageUrl ?? toAbsoluteUrl(DEFAULT_SEO_IMAGE) ?? DEFAULT_SEO_IMAGE,
  });

  const phase = eventPhase(event, now);
  const isPast = phase === 'ended';
  const status = whenLabel(event, now, phase === 'running');
  const registration = describeRegistration(event, now, isTeam ? 'team' : undefined);
  const closedText = registration.blocked;

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
        title={`${event.title} in ${eventTown(event)} | ${brand}`}
        description={description}
        canonical={canonical}
        image={coverImageUrl}
        jsonLd={jsonLd}
        jsonLdId={`event-jsonld-${event._id}`}
        noIndex={event.visibility !== 'public'}
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
          location={formatEventPlace(event)}
          isPast={isPast}
          status={status}
          maxHeightClassName="min-h-[340px] md:min-h-[400px]"
        >
          {isSeller ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {exclusion && !isPast ? (
                // Excluded with items handed in: still here for the return
                <span className="inline-flex items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm sm:self-auto">
                  <Ban className="h-4 w-4" />
                  {t('page.excluded')}
                  {sellerNumber
                    ? ` · ${t('common:sellerNumberShort', { number: sellerNumber })}`
                    : ''}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-success-soft px-3 py-1.5 text-sm font-medium text-success-soft-foreground sm:self-auto">
                  <Check className="h-4 w-4" />
                  {isPast ? t('page.soldHere') : t('page.sellingHere')}
                  {sellerNumber
                    ? ` · ${t('common:sellerNumberShort', { number: sellerNumber })}`
                    : ''}
                </span>
              )}
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
          ) : isPast ? null : exclusion || closedText ? (
            // Who cannot join learns why, instead of a button that only fails
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
              {exclusion ? (
                <Ban className="h-4 w-4" />
              ) : registration.invitationHelps ? (
                <Clock className="h-4 w-4" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              {exclusion ? t('page.excluded') : closedText}
            </span>
          ) : (
            <div className="flex flex-col items-start gap-2 md:items-end">
              <Button
                size="lg"
                className="bg-white font-semibold text-primary shadow-lg hover:bg-white/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                onClick={handleJoinAsVendor}
              >
                <Plus className="mr-2 h-5 w-5" />
                {t('page.join')}
              </Button>
              {/* How long and how many: who hesitates sees it is worth hurrying */}
              {(registration.until || registration.spots || registration.region) && (
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/85 md:justify-end">
                  {registration.until && (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {registration.until}
                    </span>
                  )}
                  {registration.spots && (
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {registration.spots}
                    </span>
                  )}
                  {registration.region && (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      <RegionMapLink
                        image={event.regionMapImage}
                        codes={registration.regionCodes}
                        className="text-white"
                      >
                        {registration.region}
                      </RegionMapLink>
                    </span>
                  )}
                </p>
              )}
            </div>
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

        {exclusion && !isPast && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">{t('join.excluded')}</p>
            {exclusion.reason && (
              <p className="mt-1 text-muted-foreground">
                {t('join.excludedReason', { reason: exclusion.reason })}
              </p>
            )}
            {isSeller && <p className="mt-1 text-muted-foreground">{t('join.excludedHandedIn')}</p>}
          </div>
        )}
        {!exclusion && closedText && !isSeller && !isPast && (
          <p className="mb-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            {closedText}. {registration.invitationHelps ? t('join.closedHint') : t('join.fullHint')}
          </p>
        )}

        {event.visibility === 'approved' && !isSeller && !isPast && (
          <p className="mb-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            {t('page.linkOnlyHint')}
          </p>
        )}

        {isSeller && (
          <div className="mb-6 space-y-6 empty:hidden">
            <MyRejections eventId={event._id} />
            <SellerBroadcasts eventId={event._id} />
          </div>
        )}

        {/* The conditions in a few words; the sidebar has them in full */}
        {!isPast && (
          <div className="mb-6">
            <ConditionFacts event={event} detailsId="seller-conditions" />
          </div>
        )}

        <EventProductPreview
          eventId={event._id}
          comingSoon={phase === 'running' && resolveEventFeatures(event).publicCatalog}
        />

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-card rounded-xl border p-5 sm:p-6">
              <SafeMarkdown
                content={event.description}
                className="text-foreground/90 leading-7 
                    [&_p]:mb-5 [&_p:last-child]:mb-0 
                    [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:mb-5 [&_ol]:mb-5 [&_li]:ml-5 [&_li]:mb-2
                    [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4 
                    [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 
                    [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mt-6 [&_h3]:mb-3 
                    [&_hr]:my-8 [&_hr]:border-border/60
                    [&_strong]:font-semibold [&_strong]:text-foreground"
              />
              {/* What is sold and what else there is, under the text that tells about it */}
              <dl className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
                <div>
                  <dt className="mb-2 text-sm font-semibold text-muted-foreground">
                    {t('page.categories')}
                  </dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {(
                      eventCategoryNames(event.categories, categoryList) ?? event.categoryLabels
                    )?.map((category: string) => (
                      <Badge key={category} variant="secondary">
                        <Tag className="mr-1 h-3 w-3" />
                        {category}
                      </Badge>
                    ))}
                  </dd>
                </div>
                {event.services.length > 0 && (
                  <div>
                    <dt className="mb-2 text-sm font-semibold text-muted-foreground">
                      {t('page.services')}
                    </dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {event.services.map((service: string) => (
                        <Badge key={service} variant="outline">
                          {serviceLabel(service)}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {event.eventMapImageUrl && (
              <div className="bg-card rounded-xl border p-5 sm:p-6">
                <h2 className="text-lg font-semibold mb-3">{t('page.map')}</h2>
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
          </div>
          {/* On phones conditions and contact come before the long description */}
          <div className="max-md:order-first">
            <EventPageSidebar
              event={event}
              conditions={event}
              withWhenWhere={false}
              eventId={isSeller ? event._id : undefined}
            />
          </div>
        </div>
        <div className="mt-8 flex justify-end">
          <ReportButton targetType="event" targetId={event._id} label={t('page.report')} />
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

const DAY = 24 * 60 * 60 * 1000;

const formatTimeDE = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });

/** "Läuft gerade · bis 19 Uhr", "Heute ab 13 Uhr", "In 3 Tagen": soon enough to say so */
function whenLabel(
  event: { startDate: number; endDate: number },
  now: number,
  running: boolean
): string | undefined {
  const t = (key: 'running' | 'runningDays' | 'today' | 'tomorrow' | 'inDays', options: object) =>
    i18n.t(`hero.${key}`, { ns: 'events', ...options });
  if (running) {
    // The end time only when it is today; a bazaar over days just runs
    const endsToday = new Date(event.endDate - 1).toDateString() === new Date(now).toDateString();
    return endsToday ? t('running', { time: formatTimeDE(event.endDate) }) : t('runningDays', {});
  }
  if (event.startDate < now) return undefined;
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const days = Math.floor((event.startDate - midnight) / DAY);
  const time = formatTimeDE(event.startDate);
  if (days === 0) return t('today', { time });
  if (days === 1) return t('tomorrow', { time });
  return days <= 7 ? t('inDays', { count: days }) : undefined;
}
