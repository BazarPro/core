import type { Id } from '../../../../lib/api/types';
import { useOnboarding } from '../../../../context/OnboardingContext';
import { MyProductCard, type MyProductCardProduct, type MyProductLayout } from './MyProductCard';
import { cn } from '../../../../lib/utils';
import type { InvoiceCopy } from '../../../../lib/saleBreakdown';
import { MyProductsEmptyState } from './MyProductsEmptyState';
import i18n from '../../../../i18n';
import { categoryName } from '../../../../i18n/categories';

const categoryLabelOf = (category: CategoryItem | undefined) => category && categoryName(category);

/** Dummy product for onboarding when the user has no products yet. Not stored in DB. */
const onboardingDummyProduct = (): MyProductCardProduct => ({
  _id: 'onboarding-dummy' as Id<'products'>,
  title: i18n.t('sample.title', { ns: 'seller' }),
  description: i18n.t('sample.description', { ns: 'seller' }),
  images: [],
  imageSrc: '/images/onboarding/dummyproduct-image.png',
  price: 225.0,
  productCategory: '' as Id<'categories'>,
  sold: false,
  isLocked: false,
  isAvailable: false,
});

/**
 * Renders the list of product cards in a responsive grid, Handles selection, edit, QR, and card-click callbacks.
 */
interface CategoryItem {
  _id: Id<'categories'>;
  label: string;
}

interface MyProductsGridProps {
  products: MyProductCardProduct[];
  layout?: MyProductLayout;
  /** Whether there are products at all, also if the filters hide them */
  hasProducts: boolean;
  categories: CategoryItem[] | undefined;
  selectedProductIds: Id<'products'>[];
  onToggleSelection: (id: Id<'products'>) => void;
  onEdit: (id: Id<'products'>) => void;
  onDuplicate?: (id: Id<'products'>) => void;
  onDelete?: (id: Id<'products'>) => void;
  onDownloadPrivateInvoice: (product: MyProductCardProduct, copy: InvoiceCopy) => void;
  onViewQR: (id: Id<'products'>, title: string) => void;
  onCreateProduct: () => void;
  onCardClick: (id: Id<'products'>) => void;
  onUpdateDiscount?: (id: Id<'products'>) => void;
  discountMap?: Map<string, number>;
  /** State of each item at the filtered bazaar */
  statusMap?: Map<string, string>;
  /** Whether a bazaar of the item runs now, so its price can be discounted */
  isOngoingFor?: (product: MyProductCardProduct) => boolean;
  bulkSelectionEnabled?: boolean;
  isSelectionLocked?: (id: Id<'products'>) => boolean;
  onLongPress?: (id: Id<'products'>) => void;
}

export function MyProductsGrid({
  products,
  layout = 'grid',
  hasProducts,
  categories,
  selectedProductIds,
  onToggleSelection,
  onEdit,
  onDuplicate,
  onDelete,
  onDownloadPrivateInvoice,
  onViewQR,
  onCreateProduct,
  onCardClick,
  onUpdateDiscount,
  discountMap,
  statusMap,
  isOngoingFor,
  bulkSelectionEnabled = false,
  isSelectionLocked,
  onLongPress,
}: MyProductsGridProps) {
  const { isActive, currentStep } = useOnboarding();
  const isFirstProductStep =
    currentStep?.id === 'participant-first-product' ||
    currentStep?.id === 'participant-first-product-qr' ||
    currentStep?.targetId === 'my-products-first-product' ||
    currentStep?.targetId === 'my-products-first-product-qr';
  const showOnboardingDummy = products.length === 0 && isActive && isFirstProductStep;

  if (products.length === 0 && !showOnboardingDummy) {
    return <MyProductsEmptyState hasProducts={hasProducts} onCreateProduct={onCreateProduct} />;
  }

  const displayProducts = showOnboardingDummy ? [onboardingDummyProduct()] : products;
  const noop = () => {};

  return (
    <div
      className={cn(
        layout === 'list'
          ? 'flex flex-col gap-1.5'
          : 'grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
      )}
    >
      {displayProducts.map((product, index) => {
        const isDummy = showOnboardingDummy && product._id === onboardingDummyProduct()._id;
        const selectionLocked = !!isSelectionLocked?.(product._id);
        return (
          <MyProductCard
            key={product._id}
            product={product}
            layout={layout}
            categoryLabel={
              isDummy
                ? 'Beispiel'
                : categoryLabelOf(categories?.find((c) => c._id === product.productCategory))
            }
            isSelected={!isDummy && selectedProductIds.includes(product._id)}
            onToggleSelect={isDummy || selectionLocked ? noop : onToggleSelection}
            onEdit={isDummy ? noop : onEdit}
            onDuplicate={isDummy ? undefined : onDuplicate}
            onDelete={isDummy ? undefined : onDelete}
            onDownloadPrivateInvoice={onDownloadPrivateInvoice}
            onViewQR={isDummy ? noop : onViewQR}
            onCardClick={isDummy ? noop : onCardClick}
            onUpdateDiscount={onUpdateDiscount}
            discountPercent={discountMap?.get(product._id)}
            status={statusMap?.get(product._id) ?? product.eventStatus}
            isOngoingEvent={!isDummy && !!isOngoingFor?.(product)}
            bulkSelectionEnabled={bulkSelectionEnabled}
            selectionLocked={selectionLocked}
            onLongPress={isDummy ? undefined : onLongPress}
            dataOnboardingId={index === 0 ? 'my-products-first-product' : undefined}
            qrOnboardingId={index === 0 ? 'my-products-first-product-qr' : undefined}
          />
        );
      })}
    </div>
  );
}
