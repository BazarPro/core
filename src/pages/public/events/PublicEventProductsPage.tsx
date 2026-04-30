import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useMemo, useEffect } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '../../../components/ui/button';

import { ProductCard } from '../../../components/products/ProductCard';
import { ProductFilters } from '../../../components/products/ProductFilters';
import { EventHero } from '../../../components/EventHero';
import type { Id, Doc } from '../../../../convex/_generated/dataModel';
import { Seo } from '../../../components/seo/Seo';
import { buildSeoDescription, formatDateRange, toAbsoluteUrl } from '../../../lib/seo';
import { BackButton } from '../../../components/navigation/BackButton';
import { ShareButtons } from '../../../components/ui/shareButtons';
import { Pagination } from '../../../components/ui/pagination';

/**
 *  Public Event Product List showing all products for a public event
 */

export function PublicEventProductsPage() {
  const ITEMS_PER_PAGE = 12;
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-synced state
  const searchTerm = searchParams.get('q') || '';
  const filterCategory = searchParams.get('category') || 'all';
  const filterStatus = searchParams.get('status') || 'available';
  const sortBy = searchParams.get('sort') || 'discount';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

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
            (key === 'status' && value === 'available') ||
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

  const event = useQuery(
    api.events.getPublicEventForViewer,
    eventId ? { id: eventId as Id<'events'> } : 'skip'
  );
  const coverImageUrls = useQuery(
    api.products.getImageUrls,
    event?.coverImage ? { storageIds: [event.coverImage] } : 'skip'
  );
  const products = useQuery(
    api.eventProducts.getProductsForEvent,
    eventId ? { eventId: eventId as Id<'events'> } : 'skip'
  );
  const categoryList = useQuery(api.categories.getAllCategories);

  const filteredProducts = useMemo(() => {
    // Type definition for product with potential discountPercent
    interface ProductWithDiscount extends Doc<'products'> {
      discountPercent?: number;
    }
    const productList = (products as ProductWithDiscount[] | undefined) ?? [];

    let result = productList.filter((p: ProductWithDiscount) => {
      const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || p.productCategory === filterCategory;
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'sold' && p.sold) ||
        (filterStatus === 'available' && !p.sold);
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
  }, [products, searchTerm, filterCategory, filterStatus, minPrice, maxPrice, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedProducts = filteredProducts.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  );

  const currentPath = useLocation().pathname;
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

  if (!eventId || event === undefined || products === undefined || categoryList === undefined) {
    return (
      <div>
        <Seo title="Angebote werden geladen | BazarPro" />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div>
        <Seo title="Veranstaltung nicht gefunden | BazarPro" noIndex={true} />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold">Veranstaltung nicht gefunden</h1>
          <Button onClick={() => navigate('/')} className="mt-4">
            Zurück zur Startseite
          </Button>
        </div>
      </div>
    );
  }

  const coverImageUrl = coverImageUrls?.[0];
  const dateRange = formatDateRange(event.startDate, event.endDate);
  const description = buildSeoDescription(
    event.description,
    `Angebote fuer ${event.title} in ${event.location} am ${dateRange}.`
  );
  const canonical = `/public-events/${event._id}/products`;
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

  return (
    <div>
      <Seo
        title={`Angebote bei ${event.title} in ${event.location} | BazarPro`}
        description={description}
        canonical={canonical}
        image={coverImageUrl}
        jsonLd={jsonLd}
        jsonLdId={`event-products-jsonld-${event._id}`}
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
          location={event.location}
          // maxHeightClassName="h-[300px] w-full max-h-none min-h-0 aspect-auto"
        />

        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Angebote</h2>
          <p className="text-muted-foreground">
            Entdecke alle Produkte, die auf dieser Veranstaltung angeboten werden.
          </p>
        </div>

        <ProductFilters
          searchTerm={searchTerm}
          onSearchChange={(val) => updateParams({ q: val })}
          filterCategory={filterCategory}
          onFilterCategoryChange={(val) => updateParams({ category: val })}
          categories={categoryList}
          filterStatus={filterStatus}
          onFilterStatusChange={(val) => updateParams({ status: val })}
          sortBy={sortBy}
          onSortChange={(val) => updateParams({ sort: val })}
          showEventFilter={false} // We are already in an event context
          minPrice={minPrice}
          onMinPriceChange={(val) => updateParams({ minPrice: val })}
          maxPrice={maxPrice}
          onMaxPriceChange={(val) => updateParams({ maxPrice: val })}
        />

        {/* Products Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8" id="products-start">
          {paginatedProducts.map((product: Doc<'products'>) => (
            <div
              key={product._id}
              onClick={() =>
                navigate(`/products/view/${product._id}`, {
                  state: { from: 'public-event', eventId: eventId },
                })
              }
              className="cursor-pointer"
            >
              <ProductCard
                product={product}
                categoryLabel={
                  categoryList.find((c: Doc<'categories'>) => c._id === product.productCategory)
                    ?.label
                }
                showSelection={false}
                showActions={false} // Read-only view
              />
            </div>
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
          <div className="text-center py-12 bg-card rounded-lg border">
            <ShoppingBag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl mb-2">Keine Produkte gefunden</h3>
            <p className="text-muted-foreground">Versuche es mit anderen Filtereinstellungen.</p>
          </div>
        )}
      </div>
    </div>
  );
}
