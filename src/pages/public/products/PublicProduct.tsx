import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import type { Id } from '../../../lib/api/types';
import { areOffersOpen, discountedPrice } from '../../../shared/eventFeatures';

import { PublicProductEmptyState } from './components/PublicProductEmptyState';
import { PublicProductImageGallery } from './components/PublicProductImageGallery';
import { PublicProductOwnerActions } from './components/PublicProductOwnerActions';
import { PublicProductDetails, PublicProductSummary } from './components/PublicProductInfo';
import { PublicProductVendorCard } from './components/PublicProductVendorCard';
import { PublicProductOrganizerActions } from './components/PublicProductOrganizerActions';
import { AdminModerationBox } from '../../../components/moderation/AdminModerationBox';
import { ModerationNotice } from '../../../components/moderation/ModerationNotice';
import { ReportButton } from '../../../components/moderation/ReportDialog';
import { PublicProductOffer } from './components/PublicProductOffer';
import { PublicProductOffersForSeller } from './components/PublicProductOffersForSeller';
import { ProductNegotiationForStaff } from './components/ProductNegotiationForStaff';
import { PublicProductQuestions } from './components/PublicProductQuestions';
import { ProductRolePanel, ProductRoleSwitch } from './components/ProductRolePanel';
import { getProductViewMode } from '../../../lib/productViewMode';
import { Button } from '../../../components/ui/button';
import { HandCoins, Info, ShieldCheck, Store } from 'lucide-react';
import { useUserRole } from '../../../context/UserRoleContext';
import { ShareButtons } from '../../../components/ui/shareButtons';
import { BackButton } from '../../../components/navigation/BackButton';
import { ProductDiscountDialog } from '../../seller/products/components/ProductDiscountDialog';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { Seo } from '../../../components/seo/Seo';
import { buildSeoDescription, toAbsoluteUrl } from '../../../lib/seo';
import { Footer } from '../../../components/layout/Footer';
import { useInstanceConfig } from '../../../hooks/useInstanceConfig';
import { useTranslation } from 'react-i18next';
import { areQuestionsOpen } from '../../../shared/eventFeatures';

/**
 * Public product detail page: loads product, images, and events; handles loading and
 * empty states; composes image gallery, info, vendor card, and owner actions.
 */
export function PublicProduct() {
  const { t } = useTranslation('product');
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { brand } = useInstanceConfig();

  const product = usePublicQuery(
    api.products.getProduct,
    productId ? { productId: productId as Id<'products'> } : 'skip'
  );
  const currentUser = useQuery(api.users.viewer);
  const isAdmin = useQuery(api.moderation.isViewerAdmin, {});
  const deleteProduct = useMutation(api.products.deleteProduct);
  const updateProductDiscount = useMutation(api.eventProducts.updateProductDiscount);

  const imageUrls = usePublicQuery(
    api.products.getImageUrls,
    product && product.images ? { storageIds: product.images } : 'skip'
  );
  const eventIds = usePublicQuery(
    api.eventProducts.getEventIdsForProduct,
    productId ? { productId: productId as Id<'products'> } : 'skip'
  );
  const eventLocations = usePublicQuery(
    api.eventProducts.getEventLocationsForProduct,
    productId ? { productId: productId as Id<'products'> } : 'skip'
  );
  const events = usePublicQuery(
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
        title={t('page.noneSelected')}
        description={t('page.noneSelectedText')}
        onGoHome={() => navigate('/')}
      />
    );
  }

  if (product === undefined) {
    return null;
  }

  if (product === null) {
    return (
      <>
        <Seo title={`${t('page.notFound')} | ${brand}`} noIndex={true} />
        <PublicProductEmptyState
          title={t('page.notFound')}
          description={t('page.notFoundText')}
          onGoHome={() => navigate('/')}
        />
      </>
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
      toast.success(t('page.discountSaved'));
    } catch (error) {
      console.error('Failed to update discount:', error);
      toast.error(t('page.saveFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsDiscountSaving(false);
    }
  };

  const images = imageUrls || [];
  const isOwner = !!currentUser && product.vendorId === currentUser._id;

  // Keep in sync with productMeta() in server/seo.ts (server-rendered head tags)
  const seoDescription = buildSeoDescription(product.description, `${product.title} bei BazarPro.`);
  const seoCanonical = `/products/view/${product._id}`;
  const seoAvailable = !product.sold && product.readyForSale !== false;
  const seoJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: seoDescription,
    url: toAbsoluteUrl(seoCanonical),
    ...(images[0] ? { image: [images[0]] } : {}),
    offers: {
      '@type': 'Offer',
      price: product.price.toFixed(2),
      priceCurrency: 'EUR',
      availability: seoAvailable ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      url: toAbsoluteUrl(seoCanonical),
    },
  };
  const mode = getProductViewMode({
    role,
    isOwner,
    isOrganizer: product.isOrganizer && !!product.organizerEventId,
    isAdmin: !!isAdmin,
  });
  const features = product.activeListing?.features;
  const listing = product.activeListing;
  const canBuyerAsk =
    mode.buyerActions && !!features?.questions && !product.sold && !product.moderation;
  // Some bazaars only take questions while they run, so nobody inspects items beforehand
  const questionsOpen = !!listing && areQuestionsOpen(listing, Date.now());
  const showSellerOffers = !!features?.priceOffers && !product.sold;
  const sellerTakesOffers =
    !!features?.priceOffers && !!product.acceptsOffers && !product.sold && !product.moderation;
  const offersOpen = !!product.activeListing && areOffersOpen(product.activeListing, Date.now());
  const canMakeOffer = mode.buyerActions && sellerTakesOffers && offersOpen;
  const eventList = closestEvent ? [closestEvent] : [];

  return (
    <div>
      <Seo
        title={`${product.title} | ${brand}`}
        description={seoDescription}
        canonical={seoCanonical}
        image={images[0]}
        type="product"
        noIndex={!seoAvailable}
        jsonLd={seoJsonLd}
        jsonLdId={`product-jsonld-${product._id}`}
      />
      <div className="container mx-auto px-4 pb-12">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between">
            <BackButton variant="ghost" />
            <ShareButtons url={currentPage} title={product.title} variant="ghost" />
          </div>

          <ModerationNotice moderation={product.moderation} target="product" />
          <ProductRoleSwitch roles={mode.roles} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:grid-rows-[auto_1fr] lg:gap-x-10">
            <div className="lg:col-start-1">
              <PublicProductImageGallery
                images={images}
                productTitle={product.title}
                isSold={product.sold}
              />
            </div>

            {/* Buy box and the tools of the active role */}
            <aside className="space-y-4 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-start">
              <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                <PublicProductSummary
                  title={product.title}
                  price={product.price}
                  condition={product.condition}
                  sold={product.sold}
                  categoryName={product.categoryName}
                  discountPercent={product.discountPercent}
                  negotiable={product.isNegotiable}
                />

                <div className="space-y-2">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    {product.sold ? t('page.offeredAt') : t('page.availableAt')}
                  </h2>
                  <PublicProductVendorCard
                    events={eventList}
                    productId={productId as Id<'products'>}
                    locationLabelByEventId={locationLabelByEventId}
                  />
                  {eventList.length > 0 && !product.sold && (
                    <p className="flex gap-2 text-xs text-muted-foreground">
                      <Store className="h-4 w-4 shrink-0" />
                      {t('page.payOnSite')}
                    </p>
                  )}
                </div>

                {canMakeOffer && product.activeListing && (
                  <PublicProductOffer
                    productId={productId as Id<'products'>}
                    currentPrice={discountedPrice(product.price, product.discountPercent)}
                    eventTitle={product.activeListing.eventTitle}
                    isLoggedIn={!!currentUser}
                  />
                )}
                {mode.buyerActions && sellerTakesOffers && !offersOpen && (
                  <p className="flex items-start gap-2 border-t pt-5 text-sm text-muted-foreground">
                    <HandCoins className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {t('page.offersLater')}
                  </p>
                )}
              </section>

              {mode.panel === 'seller' && (
                <PublicProductOwnerActions
                  productId={productId as Id<'products'>}
                  onDelete={handleDelete}
                  onUpdateDiscount={() => setDiscountDialogOpen(true)}
                  isOngoingEvent={!!ongoingEvent}
                  isAvailable={product.isAvailable}
                  discountRules={product.discountRules}
                >
                  {showSellerOffers && (
                    <PublicProductOffersForSeller productId={productId as Id<'products'>} />
                  )}
                </PublicProductOwnerActions>
              )}

              {mode.panel === 'organizer' && product.organizerEventId && (
                <PublicProductOrganizerActions
                  productId={productId as Id<'products'>}
                  eventId={product.organizerEventId as Id<'events'>}
                >
                  {!product.sold && (
                    <ProductNegotiationForStaff
                      productId={productId as Id<'products'>}
                      offersOpen={offersOpen}
                      minimumPrice={features?.minimumPrice ? product.minimumPrice : undefined}
                      acceptsOffers={!!features?.priceOffers && !!product.acceptsOffers}
                    />
                  )}
                </PublicProductOrganizerActions>
              )}

              {mode.panel === 'admin' && (
                <ProductRolePanel
                  icon={ShieldCheck}
                  title={t('page.moderation')}
                  testId="admin-panel"
                >
                  <AdminModerationBox
                    embedded
                    target={{
                      type: 'product',
                      id: productId as Id<'products'>,
                      label: product.title,
                      hidden: !!product.moderation,
                    }}
                  />
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link to="/admin/reports">{t('page.openReports')}</Link>
                  </Button>
                </ProductRolePanel>
              )}
            </aside>

            <div className="space-y-10 lg:col-start-1 lg:self-start">
              <PublicProductDetails
                description={product.description}
                attributeList={product.attributeList}
              />

              <PublicProductQuestions
                productId={productId as Id<'products'>}
                canAsk={canBuyerAsk && questionsOpen}
                opensAt={
                  canBuyerAsk && !questionsOpen && listing && listing.startDate > Date.now()
                    ? listing.startDate
                    : undefined
                }
                isLoggedIn={!!currentUser}
                canManage={mode.panel === 'seller' || mode.panel === 'organizer'}
                canModerate={mode.panel === 'admin'}
              />

              <div className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-xl bg-muted/50 p-4 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="flex-1 min-w-56">{t('page.disclaimer')}</p>
                {mode.buyerActions && (
                  <ReportButton
                    targetType="product"
                    targetId={productId as string}
                    label={t('page.report')}
                    className="-my-1"
                  />
                )}
              </div>
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
          maxDiscount={product.discountRules?.maxDiscountPercent}
        />
      )}
      {/* Impressum, Datenschutz and AGB; the event page is the start page of a self-hosted instance */}
      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
