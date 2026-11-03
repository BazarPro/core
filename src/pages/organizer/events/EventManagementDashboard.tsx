import type { ProductWithStatus } from './dashboard/components/inventoryTypes';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { OfflineReadyCard } from './dashboard/components/OfflineReadyCard';
import { ShoppingBag, Users, DollarSign, Eye, ChevronRight, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { EventHero } from '../../../components/EventHero';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import type { Id } from '../../../lib/api/types';
import { formatPriceDE } from '../../../lib/utils';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { toast } from 'sonner';
import { AdminEventBanner } from '../../../components/moderation/AdminEventBanner';
import { RecentBroadcastsCard } from '../../../components/broadcasts/RecentBroadcastsCard';
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

  const myRoles = useQuery(api.eventRoles.getMyRolesForEvent, { eventId });
  const viewer = useQuery(api.users.viewer);
  // Writing to all sellers stays with the organizer, helpers only see the messages
  const canBroadcast = (myRoles ?? []).includes('organizer') || viewer?.systemRole === 'admin';
  const canManage =
    (myRoles ?? []).includes('organizer') || (myRoles ?? []).includes('coorganizer');

  const products = useQuery(
    api.eventProducts.getProductsForEventManagement,
    canManage ? { eventId: eventId } : 'skip'
  ) as ProductWithStatus[] | undefined;
  const vendors = useQuery(
    api.eventRoles.getVendorsForEvent,
    canManage ? { eventId: eventId } : 'skip'
  );
  const event = useQuery(api.events.getEvent, { id: eventId });
  const requestReview = useMutation(api.events.requestEventReviewForOrganizer);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);

  useEffect(() => {
    if (myRoles !== undefined && !canManage) {
      navigate('/', { replace: true });
    }
  }, [myRoles, canManage, navigate]);

  if (myRoles === undefined || !canManage) {
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

  const approvalStatus = event.approvalStatus;
  const isPendingApproval =
    event.visibility === 'public' && (approvalStatus === 'pending' || event.isApproved === false);
  const isRejected = event.visibility === 'public' && approvalStatus === 'rejected';
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
        <OfflineReadyCard eventId={eventId} event={event} canRenewKeys={canBroadcast} />
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
          maxHeightClassName="h-[300px] w-full max-h-none min-h-0 aspect-auto"
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <StatTile
            icon={ShoppingBag}
            iconClassName="bg-primary/10 text-primary"
            label={t('dashboard.products')}
            value={products.length}
            to={`/events/view/${eventId}/products`}
          />
          <StatTile
            icon={Users}
            iconClassName="bg-green-100 text-green-600"
            label={t('dashboard.participants')}
            value={vendors.length}
            to={`/events/view/${eventId}/sellers`}
          />
          <StatTile
            icon={DollarSign}
            iconClassName="bg-amber-100 text-amber-600"
            label={t('dashboard.revenue')}
            value={`${formatPriceDE(totalRevenue)} €`}
            to={`/events/view/${eventId}/products?tab=sold`}
          />
        </div>

        <div className="mt-8">
          <RecentBroadcastsCard
            eventId={eventId}
            canSend={canBroadcast}
            onShowAll={() => navigate(`/events/view/${eventId}/sellers`)}
          />
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  iconClassName,
  label,
  value,
  to,
}: {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string | number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-xl border bg-card p-6 shadow-sm transition-colors hover:bg-muted/50"
    >
      <span className={`rounded-lg p-3 ${iconClassName}`}>
        <Icon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <span className="block text-3xl font-black">{value}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </Link>
  );
}
