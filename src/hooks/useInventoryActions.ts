import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useState } from 'react';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../lib/errors';

export type InventoryActionType = 'sell' | 'return' | 'undoSale' | 'undoReturn' | 'markAvailable';

export function useInventoryActions() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateStatusMutation = useMutation(api.eventProducts.updateProductStatus);
  const sellProductMutation = useMutation(api.purchases.sellProduct);
  const undoSaleMutation = useMutation(api.purchases.undoSale);
  const undoReturnMutation = useMutation(api.eventProducts.undoReturn);
  const markAllAvailableMutation = useMutation(api.eventProducts.markAllVendorProductsAvailable);

  const performAction = async (
    type: InventoryActionType,
    args: {
      eventProductId?: Id<'eventProducts'>;
      eventId?: Id<'events'>;
      vendorId?: Id<'users'>;
      locationCategoryId?: Id<'eventLocationCategories'>;
    },
    onSuccess?: () => void
  ) => {
    setIsSubmitting(true);
    try {
      switch (type) {
        case 'sell':
          if (!args.eventProductId) throw new Error('Missing ID');
          await sellProductMutation({ eventProductId: args.eventProductId });
          break;
        case 'return':
          if (!args.eventProductId) throw new Error('Missing ID');
          await updateStatusMutation({ eventProductId: args.eventProductId, status: 'returned' });
          break;
        case 'undoSale':
          if (!args.eventProductId) throw new Error('Missing ID');
          await undoSaleMutation({ eventProductId: args.eventProductId });
          break;
        case 'undoReturn':
          if (!args.eventProductId) throw new Error('Missing ID');
          await undoReturnMutation({ eventProductId: args.eventProductId });
          break;
        case 'markAvailable':
          if (!args.eventProductId) throw new Error('Missing ID');
          await updateStatusMutation({
            eventProductId: args.eventProductId,
            status: 'available',
            ...(args.locationCategoryId !== undefined
              ? { locationCategoryId: args.locationCategoryId }
              : {}),
          });
          break;
      }
      onSuccess?.();
      return { success: true };
    } catch (err) {
      console.error(`Inventory action ${type} failed:`, err);
      toast.error('Aktion fehlgeschlagen', {
        description: getUserFacingErrorMessage(err),
      });
      return { success: false, error: err };
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAllAvailable = async (
    eventId: Id<'events'>,
    vendorId: Id<'users'>,
    onSuccess?: () => void
  ) => {
    setIsSubmitting(true);
    try {
      await markAllAvailableMutation({ eventId, vendorId });
      onSuccess?.();
    } catch (err) {
      toast.error('Warenannahme fehlgeschlagen', {
        description: getUserFacingErrorMessage(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    performAction,
    handleMarkAllAvailable,
    isSubmitting,
  };
}
