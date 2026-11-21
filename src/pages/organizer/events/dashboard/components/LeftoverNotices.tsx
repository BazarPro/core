import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Megaphone, MoonStar, RotateCcw, X } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { ConfirmDialog } from '../../../../../components/ui/confirm-dialog';
import { BroadcastDialog } from '../../../../../components/broadcasts/BroadcastDialog';
import { useMutation } from '../../../../../lib/api/react';
import { api } from '../../../../../lib/api/functions';
import type { Doc, Id } from '../../../../../lib/api/types';
import { getUserFacingErrorMessage } from '../../../../../lib/errors';
import { formatDateTimeDE } from '../../../../../lib/utils';
import { resolveEventFeatures } from '../../../../../shared/eventFeatures';
import type { ProductWithStatus } from './inventoryTypes';

/** Returns stay possible while the settlement runs (sales::SETTLEMENT_DAYS) */
const SETTLEMENT_MS = 90 * 24 * 60 * 60 * 1000;

const dismissKey = (eventId: string) => `autoReturnedNotice:${eventId}`;

function wasDismissed(eventId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(eventId)) === '1';
  } catch {
    return false;
  }
}

/**
 * The end of the bazaar in the product management (#305). While items are still
 * available: how many and of how many sellers, when the cron returns them, and the button
 * to return them all at once. After the cron: what it returned, to clear up with the
 * sellers whether they really picked it up.
 */
export function LeftoverNotices({
  eventId,
  event,
  products,
  isVendorPaid,
  canReturn,
  canMessage,
  undoEnabled,
  now,
  onShowLeftovers,
  onShowAutoReturned,
}: {
  eventId: Id<'events'>;
  event: Doc<'events'>;
  products: ProductWithStatus[];
  isVendorPaid: (vendorId: Id<'users'>) => boolean;
  /** The return right: the button to return all */
  canReturn: boolean;
  /** Messages to sellers are the organizer's */
  canMessage: boolean;
  /** Single returns can be taken back (flag allow_undo_inventory_actions) */
  undoEnabled: boolean;
  now: number;
  onShowLeftovers: () => void;
  onShowAutoReturned: () => void;
}) {
  const { t } = useTranslation('organizer');
  const returnLeftovers = useMutation(api.eventProducts.returnLeftovers);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => wasDismissed(eventId));

  // Paid-out sellers are settled: their items stay as they are
  const leftovers = products.filter((p) => p.status === 'available' && !isVendorPaid(p.vendorId));
  const sellerCount = new Set(leftovers.map((p) => p.vendorId)).size;
  const autoReturned = products.filter(
    (p) => p.status === 'returned' && p.autoReturnedAt !== undefined
  ).length;

  const over = event.endDate < now;
  const settlementOpen = event.endDate + SETTLEMENT_MS > now;
  const autoReturn = resolveEventFeatures(event).autoReturn;
  const pickupEnd = event.sellerLogistics?.pickupEnd;
  // The cron's night is still to come: once per bazaar
  const cronPending = autoReturn && event.leftoversReturnedAt === undefined;

  const showLeftovers = over && settlementOpen && leftovers.length > 0;
  const showAutoReturned = autoReturned > 0 && !dismissed;
  if (!showLeftovers && !showAutoReturned) return null;

  const sellers = t('products.leftoverSellers', { count: sellerCount });
  const when = !autoReturn
    ? t('products.leftoversAutoOff')
    : !cronPending
      ? undefined
      : pickupEnd !== undefined && pickupEnd > now
        ? t('products.leftoversAfterPickup', { time: formatDateTimeDE(pickupEnd) })
        : t('products.leftoversTonight');

  const handleConfirm = async (e: React.MouseEvent) => {
    // Open while saving, so a double click does not ask twice
    e.preventDefault();
    setIsReturning(true);
    try {
      const { returnedCount } = await returnLeftovers({
        eventId,
        productIds: leftovers.map((p) => p._id),
      });
      toast.success(t('products.leftoversReturned', { count: returnedCount }));
      setConfirmOpen(false);
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsReturning(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(eventId), '1');
    } catch {
      // Shows again next time
    }
  };

  return (
    <>
      {showLeftovers && (
        <div
          className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="leftovers-notice"
        >
          <div className="flex items-start gap-3 text-sm">
            <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">
                {t('products.leftovers', { count: leftovers.length, sellers })}
              </p>
              {when && <p className="text-muted-foreground">{when}</p>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="ghost" onClick={onShowLeftovers}>
              {t('products.show')}
            </Button>
            {canReturn && (
              <Button variant="outline" className="gap-2" onClick={() => setConfirmOpen(true)}>
                <RotateCcw className="h-4 w-4" /> {t('products.returnLeftovers')}
              </Button>
            )}
          </div>
        </div>
      )}

      {showAutoReturned && (
        <div
          className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="auto-returned-notice"
        >
          <div className="flex items-start gap-3 text-sm">
            <MoonStar className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">
                {t('products.autoReturnedNotice', { count: autoReturned })}
              </p>
              <p className="text-muted-foreground">{t('products.autoReturnedClearUp')}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={onShowAutoReturned}>
              {t('products.show')}
            </Button>
            {canMessage && (
              <Button variant="outline" className="gap-2" onClick={() => setMessageOpen(true)}>
                <Megaphone className="h-4 w-4" /> {t('products.messageSellers')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={dismiss}
              aria-label={t('products.hideNotice')}
              title={t('products.hideNotice')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !open && !isReturning && setConfirmOpen(false)}
        title={t('products.returnLeftoversTitle', { count: leftovers.length })}
        description={t('products.returnLeftoversText', { sellers })}
        confirmLabel={t('products.returnLeftoversConfirm')}
        loading={isReturning}
        disabled={leftovers.length === 0}
        onConfirm={handleConfirm}
      >
        <p className="text-sm text-muted-foreground">
          {t('products.returnLeftoversPickup')} {undoEnabled && t('products.returnLeftoversUndo')}
        </p>
      </ConfirmDialog>

      {canMessage && (
        <BroadcastDialog
          eventId={eventId}
          initialAudience="pickup"
          open={messageOpen}
          onOpenChange={setMessageOpen}
        />
      )}
    </>
  );
}
