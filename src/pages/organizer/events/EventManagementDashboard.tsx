import { OfflineReadyCard } from './dashboard/components/OfflineReadyCard';
import { ShoppingBag, Users, DollarSign, Eye, ChevronRight, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { EventHero } from '../../../components/EventHero';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import type { Doc, Id } from '../../../lib/api/types';
import { formatPriceDE } from '../../../lib/utils';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { toast } from 'sonner';
import { AdminEventBanner } from '../../../components/moderation/AdminEventBanner';
import { RecentBroadcastsCard } from '../../../components/broadcasts/RecentBroadcastsCard';
import { ModerationNotice } from '../../../components/moderation/ModerationNotice';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../components/ui/alert-dialog';
import { Trans, useTranslation } from 'react-i18next';
import { ProofOfOffersCard } from './dashboard/components/ProofOfOffersCard';
import { PageSkeleton } from '../../../components/ui/loading';

type ManagedProduct = Doc<'products'> & {
  eventProductId: Id<'eventProducts'>;
  status: string;
  discountPercent?: number;
};

/** A bazaar that ended less than a day ago may still be settled on site */
const DAY_MS = 24 * 60 * 60 * 1000;

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
  ) as ManagedProduct[] | undefined;
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

  const soldProductsCount = products.filter((p) => p.status === 'sold').length;
  const totalRevenue = products
    .filter((p) => p.status === 'sold')
    .reduce((sum, p) => sum + p.price, 0);

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
        <OfflineReadyCard eventId={eventId} enabled={event.endDate > Date.now() - DAY_MS} />
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
                    <AlertDialog open={resubmitOpen} onOpenChange={setResubmitOpen}>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          {t('dashboard.resubmit')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('dashboard.resubmitTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('dashboard.resubmitText')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('actions.cancel', { ns: 'common' })}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleRequestReview}
                            disabled={isResubmitting}
                          >
                            {isResubmitting
                              ? t('dashboard.sending')
                              : t('dashboard.resubmitConfirm')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
          location={event.location}
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
          <div
            className="bg-card border rounded-xl p-6 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate(`/events/view/${eventId}/products`)}
          >
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <ShoppingBag className="text-primary h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground uppercase font-bold tracking-wider">
                  {t('dashboard.products')}
                </div>
                <div className="text-3xl font-black">{products.length}</div>
              </div>
              <ChevronRight className="text-muted-foreground h-5 w-5" />
            </div>
          </div>

          <div
            className="bg-card border rounded-xl p-6 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate(`/events/view/${eventId}/sellers`)}
          >
            <div className="flex items-center gap-4">
              <div className="bg-green-100 p-3 rounded-lg">
                <Users className="text-green-600 h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground uppercase font-bold tracking-wider">
                  {t('dashboard.participants')}
                </div>
                <div className="text-3xl font-black">{vendors.length}</div>
              </div>
              <ChevronRight className="text-muted-foreground h-5 w-5" />
            </div>
          </div>

          <div
            className="bg-card border rounded-xl p-6 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate(`/events/view/${eventId}/products?tab=sold`)}
          >
            <div className="flex items-center gap-4">
              <div className="bg-amber-100 p-3 rounded-lg">
                <DollarSign className="text-amber-600 h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground uppercase font-bold tracking-wider">
                  {t('dashboard.revenue')}
                </div>
                <div className="text-3xl font-black">{formatPriceDE(totalRevenue)} €</div>
              </div>
              <ChevronRight className="text-muted-foreground h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="mt-8">
          <RecentBroadcastsCard
            eventId={eventId}
            canSend={canBroadcast}
            onShowAll={() => navigate(`/events/view/${eventId}/sellers`)}
          />
        </div>

        <div className="mt-8">
          <ProofOfOffersCard eventId={eventId} />
        </div>

        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6">{t('dashboard.statusOverview')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-muted/30 border rounded-lg p-4 text-center">
              <div className="text-2xl font-black">
                {products.filter((p) => p.status === 'announced').length}
              </div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">
                {t('dashboard.announced')}
              </div>
            </div>
            <div className="bg-muted/30 border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-primary">
                {products.filter((p) => p.status === 'available').length}
              </div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">
                {t('dashboard.available')}
              </div>
            </div>
            <div className="bg-muted/30 border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-green-600">{soldProductsCount}</div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">
                {t('dashboard.sold')}
              </div>
            </div>
            <div className="bg-muted/30 border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-amber-600">
                {products.filter((p) => p.status === 'returned').length}
              </div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">
                {t('dashboard.returned')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
