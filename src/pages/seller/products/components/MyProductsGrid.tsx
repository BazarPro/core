import type { Id } from '../../../../../convex/_generated/dataModel';
import { useOnboarding } from '../../../../context/OnboardingContext';
import { MyProductCard, type MyProductCardProduct } from './MyProductCard';
import { MyProductsEmptyState } from './MyProductsEmptyState';

/** Dummy product for onboarding when the user has no products yet. Not stored in DB. */
const ONBOARDING_DUMMY_PRODUCT: MyProductCardProduct = {
  _id: 'onboarding-dummy' as Id<'products'>,
  title: 'Beispielprodukt',
  description: 'So könnte ein Beispielprodukt aussehen.',
  images: [],
  imageSrc: '/images/onboarding/dummyproduct-image.png',
  price: 225.0,
  productCategory: '' as Id<'categories'>,
  sold: false,
  isLocked: false,
  isAvailable: false,
};

/**
 * Renders the list of product cards in a responsive grid, Handles selection, edit, QR, and card-click callbacks.
 */
interface CategoryItem {
  _id: Id<'categories'>;
  label: string;
}

interface MyProductsGridProps {
  products: MyProductCardProduct[];
  categories: CategoryItem[] | undefined;
  selectedProductIds: Id<'products'>[];
  onToggleSelection: (id: Id<'products'>) => void;
  onEdit: (id: Id<'products'>) => void;
  onDownloadPrivateInvoice: (product: MyProductCardProduct) => void;
  onViewQR: (id: Id<'products'>, title: string) => void;
  onCreateProduct: () => void;
  onCardClick: (id: Id<'products'>) => void;
  onUpdateDiscount?: (id: Id<'products'>) => void;
  discountMap?: Map<string, number>;
  isOngoingEvent?: boolean;
  bulkSelectionEnabled?: boolean;
  isSelectionLocked?: (id: Id<'products'>) => boolean;
  onLongPress?: (id: Id<'products'>) => void;
}

export function MyProductsGrid({
  products,
  categories,
  selectedProductIds,
  onToggleSelection,
  onEdit,
  onDownloadPrivateInvoice,
  onViewQR,
  onCreateProduct,
  onCardClick,
  onUpdateDiscount,
  discountMap,
  isOngoingEvent = false,
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
    return <MyProductsEmptyState onCreateProduct={onCreateProduct} />;
  }

  const displayProducts = showOnboardingDummy ? [ONBOARDING_DUMMY_PRODUCT] : products;
  const noop = () => {};

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
      {displayProducts.map((product, index) => {
        const isDummy = showOnboardingDummy && product._id === ONBOARDING_DUMMY_PRODUCT._id;
        const selectionLocked = !!isSelectionLocked?.(product._id);
        return (
          <MyProductCard
            key={product._id}
            product={product}
            categoryLabel={
              isDummy
                ? 'Beispiel'
                : categories?.find((c) => c._id === product.productCategory)?.label
            }
            isSelected={!isDummy && selectedProductIds.includes(product._id)}
            onToggleSelect={isDummy || selectionLocked ? noop : onToggleSelection}
            onEdit={isDummy ? noop : onEdit}
            onDownloadPrivateInvoice={onDownloadPrivateInvoice}
            onViewQR={isDummy ? noop : onViewQR}
            onCardClick={isDummy ? noop : onCardClick}
            onUpdateDiscount={onUpdateDiscount}
            discountPercent={discountMap?.get(product._id)}
            isOngoingEvent={isOngoingEvent}
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
