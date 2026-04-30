import { useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

import { PublicProductEmptyState } from './components/PublicProductEmptyState';
import { PublicProductImageGallery } from './components/PublicProductImageGallery';
import { PublicProductOwnerActions } from './components/PublicProductOwnerActions';
import { PublicProductInfo } from './components/PublicProductInfo';
import { PublicProductVendorCard } from './components/PublicProductVendorCard';
import { PublicProductOrganizerActions } from './components/PublicProductOrganizerActions';
import { useUserRole } from '../../../context/UserRoleContext';
import { ShareButtons } from '../../../components/ui/shareButtons';
import { BackButton } from '../../../components/navigation/BackButton';
import { ProductDiscountDialog } from '../../seller/products/components/ProductDiscountDialog';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';

/**
 * Public product detail page: loads product, images, and events; handles loading and
 * empty states; composes image gallery, info, vendor card, and owner actions.
 */
export function PublicProduct() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  const product = useQuery(
    api.products.getProduct,
    productId ? { productId: productId as Id<'products'> } : 'skip'
  );
  const currentUser = useQuery(api.users.viewer);
  const deleteProduct = useMutation(api.products.deleteProduct);
  const updateProductDiscount = useMutation(api.eventProducts.updateProductDiscount);

  const imageUrls = useQuery(
    api.products.getImageUrls,
    product && product.images ? { storageIds: product.images } : 'skip'
  );
  const eventIds = useQuery(
    api.eventProducts.getEventIdsForProduct,
    productId ? { productId: productId as Id<'products'> } : 'skip'
  );
  const eventLocations = useQuery(
    api.eventProducts.getEventLocationsForProduct,
    productId ? { productId: productId as Id<'products'> } : 'skip'
  );
  const events = useQuery(
    api.events.getEvents,
    eventIds && eventIds.length > 0 ? { ids: eventIds } : 'skip'
  );
  const { role } = useUserRole();
  const currentPage = useLocation().pathname;

  const locationLabelByEventId = useMemo(() => {
    const map: Partial<Record<string, string>> = {};
    for (const row of eventLocations ?? []) {
      if (row.locationLabel) {
        map[row.eventId] = row.locationLabel;
      }
    }
    return map;
  }, [eventLocations]);

  const closestEvent = useMemo(() => {
    if (!events || events.length === 0) return null;

    const now = Date.now();
    const closestByEndDateDistance = events.reduce((closest, current) => {
      const closestDistance = Math.abs(closest.endDate - now);
      const currentDistance = Math.abs(current.endDate - now);

      if (currentDistance < closestDistance) {
        return current;
      }

      if (currentDistance === closestDistance && current.endDate < closest.endDate) {
        return current;
      }

      return closest;
    });

    const dayInMs = 24 * 60 * 60 * 1000;
    const isOlderThan24h = closestByEndDateDistance.endDate < now - dayInMs;
    if (!isOlderThan24h) {
      return closestByEndDateDistance;
    }

    const nextUpcomingEvent = events
      .filter((event) => event.endDate >= now)
      .sort((a, b) => a.startDate - b.startDate)[0];

    return nextUpcomingEvent ?? closestByEndDateDistance;
  }, [events]);

  // Discount State
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [isDiscountSaving, setIsDiscountSaving] = useState(false);

  const ongoingEvent = useMemo(() => {
    if (!events) return null;
    const now = Date.now();
    return events.find((e) => now >= e.startDate && now <= e.endDate) || null;
  }, [events]);

  if (!productId) {
    return (
      <PublicProductEmptyState
        title="Kein Produkt ausgewählt"
        description="Bitte wähle ein Produkt aus der Übersicht aus."
        onGoHome={() => navigate('/')}
      />
    );
  }

  if (product === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  if (product === null) {
    return (
      <PublicProductEmptyState
        title="Produkt nicht gefunden"
        description="Das gesuchte Produkt existiert leider nicht mehr oder der Link ist ungültig."
        onGoHome={() => navigate('/')}
      />
    );
  }

  const handleDelete = async () => {
    await deleteProduct({ id: productId as Id<'products'> });
    navigate('/my-products');
  };

  const handleSaveDiscount = async (discount: number) => {
    if (!ongoingEvent) return;
    setIsDiscountSaving(true);
    try {
      await updateProductDiscount({
        eventId: ongoingEvent._id,
        productId: productId as Id<'products'>,
        discountPercent: discount,
      });
      toast.success('Rabatt erfolgreich aktualisiert');
    } catch (error) {
      console.error('Failed to update discount:', error);
      toast.error('Fehler beim Speichern', {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsDiscountSaving(false);
    }
  };

  const images = imageUrls || [];
  const isOwner = currentUser && product.vendorId === currentUser._id;
  const isOrganizer = product.isOrganizer;
  const eventList = closestEvent ? [closestEvent] : [];

  return (
    <div>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-6 max-w-5xl mx-auto">
          <BackButton variant="ghost" />
          <ShareButtons url={currentPage} title={product.title} variant="ghost" />
        </div>
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Linke Spalte: Bilder & Aktionen */}
            <div className="space-y-8">
              <PublicProductImageGallery
                images={images}
                productTitle={product.title}
                isSold={product.sold}
              />

              {isOwner && role === 'participant' && (
                <PublicProductOwnerActions
                  productId={productId as Id<'products'>}
                  onDelete={handleDelete}
                  onUpdateDiscount={() => setDiscountDialogOpen(true)}
                  isOngoingEvent={!!ongoingEvent}
                  isAvailable={product.isAvailable}
                />
              )}

              {isOrganizer && role === 'organizer' && product.organizerEventId && (
                <PublicProductOrganizerActions
                  productId={productId as Id<'products'>}
                  eventId={product.organizerEventId as Id<'events'>}
                />
              )}

              <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                <p>
                  <strong>Hinweis:</strong> Alle Angaben ohne Gewähr. Bitte prüfe das Produkt vor
                  Ort vor dem Kauf. Der Verkäufer ist für die Richtigkeit der Angaben
                  verantwortlich.
                </p>
              </div>
            </div>

            {/* Rechte Spalte: Produktinfos & Verkäufer */}
            <div className="space-y-6">
              <PublicProductInfo
                title={product.title}
                price={product.price}
                condition={product.condition}
                sold={product.sold}
                categoryName={product.categoryName}
                description={product.description}
                productId={productId}
                discountPercent={product.discountPercent}
              />

              <PublicProductVendorCard
                vendorFirstName={product.vendorFirstName || 'Anonym'}
                vendorLastName={product.vendorLastName}
                vendorId={product.vendorId}
                isOrganizer={isOrganizer}
                organizerEventId={product.organizerEventId}
                events={eventList}
                productId={productId as Id<'products'>}
                locationLabelByEventId={locationLabelByEventId}
              />

              {eventList.length > 0 && !product.sold && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
                  <h3 className="mb-3 font-semibold text-lg">Kauf vor Ort</h3>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    Dieses Produkt kann während der Veranstaltung vor Ort gekauft werden. Komm zu
                    der oben genannten Veranstaltung und suche nach diesem Artikel.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isOwner && (
        <ProductDiscountDialog
          open={discountDialogOpen}
          onOpenChange={setDiscountDialogOpen}
          productTitle={product.title}
          originalPrice={product.price}
          currentDiscount={product.discountPercent ?? 0}
          onSave={handleSaveDiscount}
          isSaving={isDiscountSaving}
        />
      )}
    </div>
  );
}
