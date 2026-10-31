import { useEffect, useState } from 'react';
import type { InventoryActionType } from '../../../../../hooks/useInventoryActions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../../components/ui/alert-dialog';
import { Label } from '../../../../../components/ui/label';
import { Input } from '../../../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../../components/ui/select';
import type { Doc, Id, VendorWithCalculations } from '../../../../../lib/api/types';
import { SellerIdCheck } from '../../../../../components/sellers/SellerIdCheck';
import { formatPriceDE } from '../../../../../lib/utils';
import { useTranslation } from 'react-i18next';

interface InventoryConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: InventoryActionType | null;
  productTitle?: string;
  /** For “undo sale” only: what the buyer paid and gets back. */
  saleAmount?: number;
  /** For “accept product” only: event location categories (empty / undefined = no dropdown). */
  locationCategories?: Doc<'eventLocationCategories'>[] | undefined;
  /** For “accept product” only: current organizer note (e.g. key board hook). */
  initialNote?: string;
  /** For “accept product” only: the seller whose details the intake records (fixedSellerData). */
  idCheck?: VendorWithCalculations | undefined;
  onConfirm: (options?: {
    locationCategoryId?: Id<'eventLocationCategories'>;
    internalNote?: string;
  }) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function InventoryConfirmDialog({
  open,
  onOpenChange,
  type,
  productTitle,
  saleAmount,
  locationCategories,
  initialNote,
  idCheck,
  onConfirm,
  isSubmitting,
}: InventoryConfirmDialogProps) {
  const { t } = useTranslation('organizer');
  const [acceptLocation, setAcceptLocation] = useState<string>('none');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setAcceptLocation('none');
      setNote(initialNote ?? '');
    }
  }, [open, type, initialNote]);

  if (!type) return null;

  const getDialogContent = () => {
    switch (type) {
      case 'sell':
        return {
          title: t('confirm.sellTitle'),
          description: t('confirm.sellText', { title: productTitle }),
          actionLabel: t('confirm.sellAction'),
        };
      case 'return':
        return {
          title: t('confirm.returnTitle'),
          description: t('confirm.returnText', { title: productTitle }),
          actionLabel: t('confirm.returnAction'),
        };
      case 'undoSale':
        return {
          title: t('confirm.undoSaleTitle'),
          description: t('confirm.undoSaleText', {
            title: productTitle,
            money:
              saleAmount !== undefined
                ? t('confirm.theAmount', { amount: formatPriceDE(saleAmount) })
                : t('confirm.theirMoney'),
          }),
          actionLabel: t('confirm.undoSaleAction'),
        };
      case 'undoReturn':
        return {
          title: t('confirm.undoReturnTitle'),
          description: t('confirm.undoReturnText', { title: productTitle }),
          actionLabel: t('confirm.undoReturnAction'),
        };
      case 'markAvailable':
        return {
          title: t('confirm.acceptTitle'),
          description: t('confirm.acceptText', { title: productTitle }),
          actionLabel: t('confirm.acceptAction'),
        };
      default:
        return {
          title: t('confirm.defaultTitle'),
          description: t('confirm.defaultText'),
          actionLabel: t('confirm.defaultAction'),
        };
    }
  };

  const content = getDialogContent();
  const showLocationSelect =
    type === 'markAvailable' && locationCategories && locationCategories.length > 0;

  const runConfirm = () => {
    if (type === 'markAvailable') {
      void onConfirm({
        ...(acceptLocation !== 'none'
          ? { locationCategoryId: acceptLocation as Id<'eventLocationCategories'> }
          : {}),
        internalNote: note,
      });
    } else {
      void onConfirm();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{content.title}</AlertDialogTitle>
          <AlertDialogDescription>{content.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {type === 'markAvailable' && idCheck && <SellerIdCheck seller={idCheck} />}
        {showLocationSelect && (
          <div className="grid gap-2 py-2">
            <Label htmlFor="accept-location" className="text-foreground">
              {t('confirm.location')}
            </Label>
            <Select
              value={acceptLocation}
              onValueChange={setAcceptLocation}
              disabled={isSubmitting}
            >
              <SelectTrigger id="accept-location" className="w-full">
                <SelectValue placeholder={t('confirm.noLocation')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('confirm.noLocation')}</SelectItem>
                {locationCategories.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {type === 'markAvailable' && (
          <div className="grid gap-2 py-2">
            <Label htmlFor="accept-note" className="text-foreground">
              {t('confirm.note')}
            </Label>
            <Input
              id="accept-note"
              value={note}
              maxLength={500}
              placeholder={t('confirm.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">{t('confirm.noteHint')}</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>
            {t('actions.cancel', { ns: 'common' })}
          </AlertDialogCancel>
          <AlertDialogAction
            loading={isSubmitting}
            onClick={(e) => {
              e.preventDefault();
              runConfirm();
            }}
            disabled={isSubmitting}
            className={
              type === 'undoSale' || type === 'undoReturn' || type === 'return'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : ''
            }
          >
            {isSubmitting ? t('confirm.processing') : content.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
