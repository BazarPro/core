import { ShoppingBag, Users, DollarSign, Eye, ChevronRight, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { EventHero } from '../../../components/EventHero';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { formatPriceDE } from '../../../lib/utils';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { toast } from 'sonner';
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

type ManagedProduct = Doc<'products'> & {
  eventProductId: Id<'eventProducts'>;
  status: string;
  discountPercent?: number;
};

export function EventManagementDashboard() {
  // Hooks
  const params = useParams();
  const eventId = params.eventId as Id<'events'>;

  const navigate = useNavigate();

  const myRoles = useQuery(api.eventRoles.getMyRolesForEvent, { eventId });
  const canManage =
    (myRoles ?? []).includes('organizer') || (myRoles ?? []).includes('coorganizer');

  const products =
    (useQuery(
      api.eventProducts.getProductsForEventManagement,
      canManage ? { eventId: eventId } : 'skip'
    ) as ManagedProduct[]) ?? [];
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
      navigate('/my-events', { replace: true });
    }
  }, [myRoles, canManage, navigate]);

  if (myRoles === undefined || !canManage) {
    return (
      <div>
        <div className="container mx-auto">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      </div>
    );
  }

  if (!event || !products || !vendors) {
    return (
      <div>
        <div className="container mx-auto">
          <h1 className="text-4xl mb-2">Event wurde nicht gefunden.</h1>
        </div>
      </div>
    );
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
      toast.success('Prüfungsanfrage wurde erneut gesendet');
      setResubmitOpen(false);
    } catch {
      toast.error('Fehler beim Senden der Anfrage');
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <div>
      <div className="container mx-auto">
        {(isPendingApproval || isRejected) && (
          <Alert variant={isRejected ? 'destructive' : 'warning'} className="mb-6">
            {isRejected ? <XCircle className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <AlertTitle>{isRejected ? 'Event wurde abgelehnt' : 'Event wird geprüft'}</AlertTitle>
            <AlertDescription>
              {isRejected ? (
                <div className="space-y-4">
                  <p>
                    Dein Event wurde leider abgelehnt. Grund:{' '}
                    <strong>{event.rejectionReason}</strong>
                  </p>
                  {canRequestReview && (
                    <AlertDialog open={resubmitOpen} onOpenChange={setResubmitOpen}>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          Erneut einreichen
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Event erneut zur Prüfung einreichen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Bitte stelle sicher, dass du die oben genannten Ablehnungsgründe behoben
                            hast, bevor du das Event erneut einreichst.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleRequestReview}
                            disabled={isResubmitting}
                          >
                            {isResubmitting ? 'Wird gesendet...' : 'Ja, erneut einreichen'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ) : (
                'Dieses öffentliche Event wird derzeit von einem Administrator geprüft. Sobald es freigegeben wurde, ist es für alle sichtbar.'
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
              Öffentliche Ansicht
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
                  Produkte
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
                  Teilnehmer
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
                  Umsatz
                </div>
                <div className="text-3xl font-black">{formatPriceDE(totalRevenue)} €</div>
              </div>
              <ChevronRight className="text-muted-foreground h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6">Status-Übersicht</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-muted/30 border rounded-lg p-4 text-center">
              <div className="text-2xl font-black">
                {products.filter((p) => p.status === 'announced').length}
              </div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Angeboten</div>
            </div>
            <div className="bg-muted/30 border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-primary">
                {products.filter((p) => p.status === 'available').length}
              </div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Verfügbar</div>
            </div>
            <div className="bg-muted/30 border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-green-600">{soldProductsCount}</div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Verkauft</div>
            </div>
            <div className="bg-muted/30 border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-amber-600">
                {products.filter((p) => p.status === 'returned').length}
              </div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">
                Zurückgegeben
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
