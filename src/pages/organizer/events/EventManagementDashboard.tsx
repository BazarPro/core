import type { ProductWithStatus } from './dashboard/components/inventoryTypes';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { OfflineReadyCard } from './dashboard/components/OfflineReadyCard';
import { NextSteps, type NextStep } from '../../../components/ui/next-steps';
import { Banknote, Eye, Megaphone, PackageCheck, ShoppingCart, Users, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { EventHero } from '../../../components/EventHero';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '../../../lib/api/react';
import { useEventAccess } from '../../../hooks/useEventAccess';
import { eventApproval } from '../../../lib/eventApproval';
import { api } from '../../../lib/api/functions';
import type { Id } from '../../../lib/api/types';
import { formatPriceDE } from '../../../lib/utils';
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
        <div className="container mx-auto">
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
      text: t('dashboard.steps.saleText', {
        sold,
        total: products.length,
        revenue: formatPriceDE(totalRevenue),
      }),
      to: `${base}/checkout`,
      done: hasEnded,
      current: hasStarted && !hasEnded,
    },
    {
      id: 'settle',
      icon: Banknote,
      title: t('dashboard.steps.settle'),
      text: t('dashboard.steps.settleText', { settled, total: vendors.length }),
      to: `${base}/cash`,
      done: vendors.length > 0 && settled === vendors.length,
      current: hasEnded && settled < vendors.length,
    },
  ];

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
      <div className="container mx-auto">
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

        <EventHero
          title={event.title}
          coverImage={event.coverImage}
          startDate={event.startDate}
          endDate={event.endDate}
          location={formatEventPlace(event)}
          maxHeightClassName="h-[320px] sm:h-[220px] w-full max-h-none min-h-0 aspect-auto"
          publicEventButton={
            <Button
              variant="secondary"
              onClick={() =>
                navigate(`/public-events/${eventId}`, {
                  state: { from: `${location.pathname}${location.search}` },
                })
              }
              className="bg-white/20 hover:bg-white/30 text-white border-white/20 backdrop-blur-sm w-full sm:w-auto"
            >
              <Eye className="mr-2 h-4 w-4" />
              {t('dashboard.publicView')}
            </Button>
          }
        />

        <NextSteps title={t('dashboard.steps.title')} steps={steps} />
      </div>
    </div>
  );
}
