import { useMutation } from '../lib/api/react';
import { api } from '../lib/api/functions';
import type { Id } from '../lib/api/types';
import { useState } from 'react';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../lib/errors';
import type { useOfflineIntake } from '../lib/offlineActions';

export type InventoryActionType = 'sell' | 'return' | 'undoSale' | 'undoReturn' | 'markAvailable';

/**
 * The team's actions on an item. With `intake` (useOfflineIntake) accepting and returning
 * also work offline: they are queued and replayed once online.
 */
export function useInventoryActions(intake?: ReturnType<typeof useOfflineIntake>) {
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
      offerId?: Id<'productOffers'>;
      negotiatedPrice?: number;
      buyerEmail?: string;
      /** The item title, for an action the backend refuses after offline */
      label?: string;
    },
    onSuccess?: () => void
  ) => {
    setIsSubmitting(true);
    let queued = false;
    try {
      switch (type) {
        case 'sell':
          if (!args.eventProductId) throw new Error('Missing ID');
          await sellProductMutation({
            eventProductId: args.eventProductId,
            offerId: args.offerId,
            negotiatedPrice: args.negotiatedPrice,
            buyerEmail: args.buyerEmail,
          });
          break;
        case 'return': {
          if (!args.eventProductId) throw new Error('Missing ID');
          const returned = { eventProductId: args.eventProductId, status: 'returned' as const };
          if (intake) {
            ({ queued } = await intake.run(
              { name: 'eventProducts.updateProductStatus', args: returned },
              args.label ?? ''
            ));
          } else {
            await updateStatusMutation(returned);
          }
          break;
        }
        case 'undoSale':
          if (!args.eventProductId) throw new Error('Missing ID');
          await undoSaleMutation({ eventProductId: args.eventProductId });
          break;
        case 'undoReturn':
          if (!args.eventProductId) throw new Error('Missing ID');
          await undoReturnMutation({ eventProductId: args.eventProductId });
          break;
        case 'markAvailable': {
          if (!args.eventProductId) throw new Error('Missing ID');
          const accepted = {
            eventProductId: args.eventProductId,
            status: 'available' as const,
            ...(args.locationCategoryId !== undefined
              ? { locationCategoryId: args.locationCategoryId }
              : {}),
          };
          if (intake) {
            ({ queued } = await intake.run(
              { name: 'eventProducts.updateProductStatus', args: accepted },
              args.label ?? ''
            ));
          } else {
            await updateStatusMutation(accepted);
          }
          break;
        }
      }
      onSuccess?.();
      return { success: true, queued };
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
      if (intake) {
        await intake.run(
          { name: 'eventProducts.markAllVendorProductsAvailable', args: { eventId, vendorId } },
          ''
        );
      } else {
        await markAllAvailableMutation({ eventId, vendorId });
      }
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
