import { EmptyState } from '../../../components/ui/empty-state';
import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { Link, useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../../../lib/api/functions';
import { useMemo, useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '../../../components/ui/button';

import { ProductCard } from '../../../components/products/ProductCard';
import { ProductFilters } from '../../../components/products/ProductFilters';
import { EventHero } from '../../../components/EventHero';
import type { Id, Doc } from '../../../lib/api/types';
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
import { useAuthState } from '../../../lib/api/react';
import { ShareButtons } from '../../../components/ui/shareButtons';
import { Pagination } from '../../../components/ui/pagination';
import { PageSkeleton } from '../../../components/ui/loading';
import { isOnOffer } from '../../../lib/eventProductStatus';
import { Footer } from '../../../components/layout/Footer';
import { useInstanceConfig } from '../../../hooks/useInstanceConfig';
import { useTranslation } from 'react-i18next';
import { categoryNames } from '../../../i18n/categories';
import { withSubcategories } from '../../../shared/categoryTree';
import {
  autoViewMode,
  loadViewMode,
  saveViewMode,
  type ProductViewMode,
} from '../../../lib/productDisplay';
import { cn } from '../../../lib/utils';

/**
 *  Public Event Product List showing all products for a public event
 */

export function PublicEventProductsPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { brand } = useInstanceConfig();
  const { t } = useTranslation('events');
  const { isAuthenticated, isLoading: authLoading } = useAuthState();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-synced state
  const searchTerm = searchParams.get('q') || '';
  const filterCategory = searchParams.get('category') || 'all';
  const sortBy = searchParams.get('sort') || 'discount';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const [chosenView, setChosenView] = useState(() => loadViewMode('eventOffers'));

  // Helper to update URL params in a stable way
  const updateParams = (updates: Record<string, string | null>, resetPage = true) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(updates).forEach(([key, value]) => {
          if (
            value === null ||
            value === '' ||
            (key === 'category' && value === 'all') ||
            (key === 'sort' && value === 'discount')
          ) {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        });
        if (resetPage) {
          next.delete('page');
        }
        return next;
      },
      { replace: true }
    );
  };

  const event = usePublicQuery(
    api.events.getPublicEventForViewer,
    eventId ? { id: eventId as Id<'events'> } : 'skip'
  );
  const coverImageUrls = usePublicQuery(
    api.products.getImageUrls,
    event?.coverImage ? { storageIds: [event.coverImage] } : 'skip'
  );
  const products = usePublicQuery(
    api.eventProducts.getProductsForEvent,
    eventId ? { eventId: eventId as Id<'events'> } : 'skip'
  );
  const categoryList = usePublicQuery(api.categories.getAllCategories, {});

  const filteredProducts = useMemo(() => {
    // Type definition for product with potential discountPercent
    interface ProductWithDiscount extends Doc<'products'> {
      discountPercent?: number;
      status: string;
    }
    const productList = (products as ProductWithDiscount[] | undefined) ?? [];
    const inCategory =
      filterCategory === 'all' ? undefined : withSubcategories(filterCategory, categoryList);
    let result = productList.filter((p: ProductWithDiscount) => {
      const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !inCategory || inCategory.has(p.productCategory);
      const matchesStatus = isOnOffer(p);
      const matchesMinPrice = minPrice === '' || p.price >= parseFloat(minPrice);
      const matchesMaxPrice = maxPrice === '' || p.price <= parseFloat(maxPrice);
      return (
        matchesSearch && matchesCategory && matchesStatus && matchesMinPrice && matchesMaxPrice
      );
    });

    if (sortBy === 'price-asc') {
      result = [...result].sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
      result = [...result].sort((a, b) => b.price - a.price);
    } else if (sortBy === 'name') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'discount') {
      result = [...result].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
    }

    return result;
  }, [products, categoryList, searchTerm, filterCategory, minPrice, maxPrice, sortBy]);

  // Tiles for photos, a list for bazaars whose items mostly have none
  const viewMode: ProductViewMode = chosenView ?? autoViewMode(products ?? []);
  const changeView = (mode: ProductViewMode) => {
    setChosenView(mode);
    saveViewMode('eventOffers', mode);
  };

  // Rows are far smaller than tiles, so a page of the list holds more of them
  const ITEMS_PER_PAGE = viewMode === 'list' ? 40 : 12;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedProducts = filteredProducts.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  );

  const location = useLocation();
  const currentPath = location.pathname;
  const offered = ((products as { sold?: boolean; status: string }[] | undefined) ?? []).filter(
    isOnOffer
  ).length;
  const scrollKey = `scroll-${currentPath}-${searchParams.toString()}`;

  // Restore scroll position when products are loaded
  useEffect(() => {
    if (products !== undefined && event !== undefined) {
      const savedScroll = sessionStorage.getItem(scrollKey);
      if (savedScroll) {
        // Small delay to ensure DOM is fully rendered
        const timer = setTimeout(() => {
          window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' });
        }, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [products, event, scrollKey]);

  // Save scroll position on unmount or before navigating away
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(scrollKey, window.scrollY.toString());
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [scrollKey]);

  // While the session loads the answer is that of a visitor; it follows once it is known
  if (
    !eventId ||
    event === undefined ||
    (!event && authLoading) ||
    products === undefined ||
    categoryList === undefined
  ) {
    return (
      <>
        <Seo title={t('offers.loadingTitle', { brand })} />
        <PageSkeleton variant="grid" className="px-4 py-8" />
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
    t('offers.seoFallback', { title: event.title, location: eventTown(event), date: dateRange })
  );
  const canonical = `/public-events/${event._id}/products`;
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
    url: toAbsoluteUrl(`/public-events/${event._id}`) ?? canonicalUrl,
    image: coverImageUrl ?? toAbsoluteUrl(DEFAULT_SEO_IMAGE) ?? DEFAULT_SEO_IMAGE,
  });

  return (
    <div>
      <Seo
        title={t('offers.seoTitle', { title: event.title, location: eventTown(event), brand })}
        description={description}
        canonical={canonical}
        image={coverImageUrl}
        jsonLd={jsonLd}
        jsonLdId={`event-products-jsonld-${event._id}`}
        noIndex={event.visibility !== 'public'}
      />
      <div className="flex items-center justify-between mb-6 max-w-5xl mx-auto">
        <BackButton variant="ghost" />
        <ShareButtons url={currentPath} title={event.title} variant="ghost" />
      </div>
      <div className="max-w-5xl mx-auto">
        <EventHero
          title={event.title}
          coverImage={event.coverImage}
          startDate={event.startDate}
          endDate={event.endDate}
          location={formatEventPlace(event)}
          // Slim: the offers are what this page is about
          maxHeightClassName="aspect-auto min-h-[150px] md:aspect-auto md:min-h-[190px]"
        />

        <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold tracking-tight">
          {t('offers.title')}
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">
            {offered}
          </span>
        </h2>

        <ProductFilters
          searchTerm={searchTerm}
          onSearchChange={(val) => updateParams({ q: val })}
          filterCategory={filterCategory}
          onFilterCategoryChange={(val) => updateParams({ category: val })}
          categories={categoryList}
          showStatusFilter={false}
          sortBy={sortBy}
          onSortChange={(val) => updateParams({ sort: val })}
          showEventFilter={false} // We are already in an event context
          viewMode={viewMode}
          onViewModeChange={changeView}
          minPrice={minPrice}
          onMinPriceChange={(val) => updateParams({ minPrice: val })}
          maxPrice={maxPrice}
          onMaxPriceChange={(val) => updateParams({ maxPrice: val })}
        />

        {/* Products Grid */}
        <div
          className={cn(
            viewMode === 'list'
              ? 'flex flex-col gap-1.5'
              : 'grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3'
          )}
          id="products-start"
        >
          {paginatedProducts.map((product: Doc<'products'>) => (
            <Link
              key={product._id}
              to={`/products/view/${product._id}`}
              state={{ from: 'public-event', eventId }}
              className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ProductCard
                product={product}
                layout={viewMode}
                categoryLabel={categoryNames([product.productCategory], categoryList)?.[0]}
              />
            </Link>
          ))}
        </div>

        <Pagination
          className="mt-8"
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={(page) => updateParams({ page: page.toString() }, false)}
          scrollRefId="products-start"
        />

        {filteredProducts.length === 0 && (
          <div className="text-center py-12 bg-card rounded-xl border">
            <ShoppingBag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {offered === 0 ? (
              <>
                <h3 className="text-xl mb-2">{t('offers.none')}</h3>
                <p className="mb-4 text-muted-foreground">{t('offers.noneText')}</p>
                <Button variant="outline" asChild>
                  <Link to={`/public-events/${eventId}`} state={location.state}>
                    {t('offers.toEvent')}
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-xl mb-2">{t('offers.empty')}</h3>
                <p className="text-muted-foreground">{t('offers.emptyText')}</p>
              </>
            )}
          </div>
        )}
      </div>
      {/* Impressum, Datenschutz and AGB; the event page is the start page of a self-hosted instance */}
      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
