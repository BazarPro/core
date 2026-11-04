import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '../../../../lib/api/react';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../lib/api/types';
import { Button } from '../../../../components/ui/button';
import type { ReactNode } from 'react';
import { Edit, Trash2, Lock, Percent, Store } from 'lucide-react';
import { Alert, AlertDescription } from '../../../../components/ui/alert';
import { getDiscountButtonState } from '../../../../lib/discountRules';
import type { DiscountRules } from '../../../../lib/api/types';
import { ProductRolePanel } from './ProductRolePanel';
import { useTranslation } from 'react-i18next';

interface PublicProductOwnerActionsProps {
  productId: Id<'products'>;
  onDelete: () => void;
  onUpdateDiscount?: () => void;
  isOngoingEvent?: boolean;
  isAvailable?: boolean;
  discountRules?: DiscountRules;
  /** Further seller tools, e.g. open price offers */
  children?: ReactNode;
}

export function PublicProductOwnerActions({
  productId,
  onDelete,
  onUpdateDiscount,
  isOngoingEvent = false,
  isAvailable = false,
  discountRules,
  children,
}: PublicProductOwnerActionsProps) {
  const { t } = useTranslation('product');
  const navigate = useNavigate();

  const isLocked = useQuery(api.eventProducts.isProductLockedForSeller, { productId });

  const canEdit = !isLocked;
  const canDelete = !isLocked;
  const discountButton = getDiscountButtonState(discountRules);

  return (
    <ProductRolePanel icon={Store} title={t('owner.title')} testId="seller-panel">
      {isLocked && (
        <Alert variant="warning">
          <Lock />
          <AlertDescription>{t('form.lockedHint', { ns: 'seller' })}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => navigate(`/products/edit/${productId}`)}
            disabled={!canEdit}
          >
            <Edit className="h-4 w-4" />
            {t('owner.edit')}
          </Button>

          <ConfirmDialog
            trigger={
              <Button variant="destructive" className="w-full gap-2" disabled={!canDelete}>
                <Trash2 className="h-4 w-4" />
                {t('owner.delete')}
              </Button>
            }
            title={t('form.confirmTitle', { ns: 'seller' })}
            description={t('form.confirmDelete', { ns: 'seller' })}
            confirmLabel={t('owner.delete')}
            onConfirm={onDelete}
            destructive
          />
        </div>

        {isOngoingEvent && isAvailable && onUpdateDiscount && discountButton.visible && (
          <Button
            variant="secondary"
            className="w-full gap-2"
            onClick={onUpdateDiscount}
            disabled={discountButton.disabled}
          >
            <Percent className="h-4 w-4" />
            {discountButton.disabled ? discountButton.label : t('owner.adjustDiscount')}
          </Button>
        )}
      </div>

      {children}
    </ProductRolePanel>
  );
}
