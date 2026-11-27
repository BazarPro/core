import type { ProductWithStatus } from './dashboard/components/inventoryTypes';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { OfflineReadyCard } from './dashboard/components/OfflineReadyCard';
import { type NextStep } from '../../../components/ui/next-steps';
import { keepFirstCurrent } from '../../../lib/nextSteps';
import { BazaarJourney } from '../../../components/ui/bazaar-roadmap';
import { StatStrip } from '../../../components/ui/stat-tile';
import { ImageWithFallback } from '../../../components/ui/image-with-fallback';
import { EventPhaseBadge } from '../../../components/events/EventPhaseBadge';
import { EventShareActions } from '../../../components/events/EventShareActions';
import {
  Banknote,
  Calendar,
  ChevronRight,
  Eye,
  MapPin,
  Megaphone,
  PackageCheck,
  ShoppingCart,
  Users,
  XCircle,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '../../../lib/api/react';
import { useEventAccess } from '../../../hooks/useEventAccess';
import { eventApproval } from '../../../lib/eventApproval';
import { api } from '../../../lib/api/functions';
import type { Id } from '../../../lib/api/types';
import { formatDateRangeDE, formatPrice } from '../../../lib/utils';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { toast } from 'sonner';
import { AdminEventBanner } from '../../../components/moderation/AdminEventBanner';
import { ModerationNotice } from '../../../components/moderation/ModerationNotice';
import { Trans, useTranslation } from 'react-i18next';
import { PageSkeleton } from '../../../components/ui/loading';
import { formatEventPlace } from '../../../shared/eventJsonLd';

export function EventManagementDashboard() {
  const { t } = useTranslation('organizer');
  // Hooks
  const params = useParams();
  const eventId = params.eventId as Id<'events'>;

  const navigate = useNavigate();

  const { isLoading, canManage, canLead } = useEventAccess(eventId);

  const products = useQuery(
    api.eventProducts.getProductsForEventManagement,
    canManage ? { eventId: eventId } : 'skip'
  ) as ProductWithStatus[] | undefined;
  const vendors = useQuery(
    api.eventRoles.getVendorsForEvent,
    canManage ? { eventId: eventId } : 'skip'
  );
  const event = useQuery(api.events.getEvent, { id: eventId });
  const promo = useQuery(api.promos.getPromo, canManage ? { eventId } : 'skip');
  const requestReview = useMutation(api.events.requestEventReviewForOrganizer);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && !canManage) {
      navigate('/', { replace: true });
    }
  }, [isLoading, canManage, navigate]);

  if (isLoading || !canManage) {
    return <PageSkeleton />;
  }

  if (event === null) {
    return (
      <div>
        <div className="page-wide">
          <h1 className="text-4xl mb-2">{t('dashboard.notFound')}</h1>
        </div>
      </div>
    );
  }

  if (!event || !products || !vendors) {
    return <PageSkeleton />;
  }

  // What buyers paid: discounts and negotiated prices count, not the list price
  const totalRevenue = products
    .filter((p) => p.status === 'sold')
    .reduce((sum, p) => sum + (p.sale?.totalAmount ?? p.price), 0);

  // The way through the bazaar: what is done, and what is due now
  const now = Date.now();
  const hasEnded = event.endDate < now;
  const hasStarted = event.startDate <= now;
  const waiting = products.filter((p) => p.status === 'announced').length;
  const sold = products.filter((p) => p.status === 'sold').length;
  const settled = vendors.filter((v) => v.paid).length;
  const base = `/events/view/${eventId}`;
  const promoted = !!promo;
  const steps: NextStep[] = [
    {
      id: 'promote',
      icon: Megaphone,
      title: t('dashboard.steps.promote'),
      text: promoted ? t('dashboard.steps.promoteDone') : t('dashboard.steps.promoteText'),
      to: `${base}/promo`,
      done: promoted,
      // First thing to do: sellers and visitors need to hear of the bazaar
      current: !hasStarted && !promoted,
      // Once the bazaar runs, promotion is past its use: no reproach for it
      lapsed: hasStarted,
    },
    {
      id: 'sellers',
      icon: Users,
      title: t('dashboard.steps.sellers'),
      text: t('dashboard.steps.sellersText', { count: vendors.length }),
      to: `${base}/sellers`,
      done: vendors.length > 0,
      current: !hasStarted && promoted && vendors.length === 0,
    },
    {
      id: 'intake',
      icon: PackageCheck,
      title: t('dashboard.steps.intake'),
      text:
        waiting > 0
          ? t('dashboard.steps.intakeWaiting', { count: waiting })
          : t('dashboard.steps.intakeText', { count: products.length }),
      to: `${base}/products?tab=announced`,
      done: products.length > 0 && waiting === 0,
      current: !hasStarted && vendors.length > 0,
    },
    {
      id: 'sale',
      icon: ShoppingCart,
      title: t('dashboard.steps.sale'),
      // The revenue stands in its tile below
      text: t('dashboard.steps.saleText', { sold, total: products.length }),
      progress: products.length > 0 ? sold / products.length : undefined,
      to: `${base}/checkout`,
      done: hasEnded,
      current: hasStarted && !hasEnded,
    },
    {
      id: 'settle',
      icon: Banknote,
      title: t('dashboard.steps.settle'),
      text: t('dashboard.steps.settleText', { settled, total: vendors.length }),
      progress: vendors.length > 0 ? settled / vendors.length : undefined,
      to: `${base}/cash`,
      done: vendors.length > 0 && settled === vendors.length,
      current: hasEnded && settled < vendors.length,
    },
  ];

  // One step at most is due now: the card shows it with its button
  const current = keepFirstCurrent(steps);
  // Steps before the current one that are still open: easy to forget once the bazaar runs
  const currentIndex = current ? steps.indexOf(current) : steps.length;
  const leftBehind = steps.filter(
    (step, index) => index < currentIndex && !step.done && step.to && !step.lapsed
  );
  // Figures the card above already names are left out of the tiles below: not twice
  const inCard = new Set([current?.id, ...leftBehind.map((step) => step.id)]);
  const nextAction: Record<string, string> = {
    promote: t('dashboard.next.promote'),
    sellers: t('dashboard.next.sellers'),
    intake: t('dashboard.next.intake'),
    sale: t('dashboard.next.sale'),
    settle: t('dashboard.next.settle'),
  };

  const approval = eventApproval(event);
  const isPendingApproval = approval === 'pending';
  const isRejected = approval === 'rejected';
  const canRequestReview = isRejected;

  const handleRequestReview = async () => {
    setIsResubmitting(true);
    try {
      await requestReview({ eventId });
      toast.success(t('dashboard.resubmitted'));
      setResubmitOpen(false);
    } catch {
      toast.error(t('dashboard.resubmitFailed'));
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-wide">
        <AdminEventBanner event={event} />
        {event.moderation && (
          <div className="mb-6">
            <ModerationNotice moderation={event.moderation} target="event" />
          </div>
        )}
        <OfflineReadyCard eventId={eventId} event={event} canRenewKeys={canLead} />
        {(isPendingApproval || isRejected) && (
          <Alert variant={isRejected ? 'destructive' : 'warning'} className="mb-6">
            {isRejected ? <XCircle className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <AlertTitle>
              {isRejected ? t('dashboard.rejectedTitle') : t('dashboard.reviewTitle')}
            </AlertTitle>
            <AlertDescription>
              {isRejected ? (
                <div className="space-y-4">
                  <p>
                    <Trans
                      i18nKey="dashboard.rejectedText"
                      ns="organizer"
                      values={{ reason: event.rejectionReason }}
                      components={{ strong: <strong /> }}
                    />
                  </p>
                  {canRequestReview && (
                    <ConfirmDialog
                      open={resubmitOpen}
                      onOpenChange={setResubmitOpen}
                      trigger={
                        <Button variant="outline" size="sm">
                          {t('dashboard.resubmit')}
                        </Button>
                      }
                      title={t('dashboard.resubmitTitle')}
                      description={t('dashboard.resubmitText')}
                      confirmLabel={
                        isResubmitting ? t('dashboard.sending') : t('dashboard.resubmitConfirm')
                      }
                      onConfirm={handleRequestReview}
                      disabled={isResubmitting}
                    />
                  )}
                </div>
              ) : (
                t('dashboard.reviewText')
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Which bazaar and where it stands: compact, the next step is what counts here */}
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <ImageWithFallback
              alt=""
              storageId={event.coverImage}
              className="size-14 shrink-0 rounded-xl object-cover sm:size-20"
            />
            <div className="min-w-0 space-y-1.5">
              <EventPhaseBadge event={event} />
              <h1 className="text-2xl font-extrabold leading-tight text-balance sm:text-3xl">
                {event.title}
              </h1>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-4 shrink-0" />
                  {formatDateRangeDE(event.startDate, event.endDate)}
                </span>
                <span className="flex min-w-0 items-start gap-1.5 sm:items-center">
                  <MapPin className="size-4 shrink-0" />
                  {/* Phones wrap the full address; wide screens keep it on one line */}
                  <span className="sm:truncate">{formatEventPlace(event)}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="md:self-center">
            <EventShareActions eventId={eventId} title={event.title} />
          </div>
        </header>

        <div className="space-y-4">
          {/* The way through the bazaar and what to do now, in one card */}
          <BazaarJourney
            steps={steps}
            label={t('dashboard.steps.title')}
            nowLabel={t('dashboard.next.now')}
            positionLabel={(position, total) => t('dashboard.next.position', { position, total })}
            action={current ? nextAction[current.id] : null}
            doneText={t('dashboard.next.allDone')}
          >
            {leftBehind.length > 0 && (
              <div className="border-t border-tag/50 pt-4">
                <h3 className="mb-1 font-sans text-sm font-semibold text-muted-foreground">
                  {t('dashboard.next.alsoOpen')}
                </h3>
                <ul>
                  {leftBehind.map((step) => (
                    <li key={step.id}>
                      <Link
                        to={step.to!}
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-tag/20"
                      >
                        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-tag" />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{step.title}</span>
                          {step.text && (
                            <span className="block text-sm text-muted-foreground">{step.text}</span>
                          )}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </BazaarJourney>
          <StatStrip
            items={[
              {
                icon: Users,
                label: t('dashboard.sellersTile'),
                value: vendors.length,
                to: `${base}/sellers`,
              },
              {
                icon: PackageCheck,
                label: t('dashboard.products'),
                value: products.length,
                hint:
                  waiting > 0 && !inCard.has('intake')
                    ? t('dashboard.steps.intakeWaiting', { count: waiting })
                    : undefined,
                urgent: waiting > 0 && !inCard.has('intake'),
                to: `${base}/products`,
              },
              {
                icon: Banknote,
                label: t('dashboard.revenue'),
                value: `${formatPrice(totalRevenue)} €`,
                // Without items "0 von 0 verkauft" says nothing
                hint:
                  inCard.has('sale') || products.length === 0
                    ? undefined
                    : t('dashboard.soldOf', { sold, total: products.length }),
                to: `${base}/products?tab=sold`,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
