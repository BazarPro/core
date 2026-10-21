import { useState } from 'react';
import { useMutation, useQuery } from '../../lib/api/react';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '../ui/button';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { ModerationActionDialog, type ModerationRequest } from './ModerationActionDialog';
import { useTranslation } from 'react-i18next';

type Target =
  | { type: 'product'; id: Id<'products'>; label: string; hidden: boolean }
  | { type: 'event'; id: Id<'events'>; label: string; hidden: boolean };

/**
 * Moderation tools for platform administrators on public product and event pages.
 * `embedded` drops the frame and label when a surrounding panel already provides them.
 */
export function AdminModerationBox({
  target,
  embedded = false,
}: {
  target: Target;
  embedded?: boolean;
}) {
  const { t } = useTranslation('admin');
  const isAdmin = useQuery(api.moderation.isViewerAdmin, {});
  const restoreProduct = useMutation(api.moderation.restoreProduct);
  const restoreEvent = useMutation(api.moderation.restoreEvent);
  const [request, setRequest] = useState<ModerationRequest | null>(null);

  if (!isAdmin) return null;

  const restore = async () => {
    try {
      if (target.type === 'product') await restoreProduct({ productId: target.id });
      else await restoreEvent({ eventId: target.id });
      toast.success(t('moderate.restored'));
    } catch (error) {
      toast.error(t('moderate.error'), { description: getUserFacingErrorMessage(error) });
    }
  };

  return (
    <div
      className={
        embedded
          ? 'flex flex-wrap items-center justify-between gap-3'
          : 'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4'
      }
      data-testid="admin-moderation-box"
    >
      {embedded ? (
        <p className="text-sm text-muted-foreground">
          {target.hidden ? t('moderate.hiddenNow') : t('moderate.visible')}
        </p>
      ) : (
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t('moderate.moderation')}
        </div>
      )}
      {target.hidden ? (
        <Button size="sm" variant="secondary" onClick={restore}>
          {target.type === 'product' ? t('moderate.showAgain') : t('moderate.unblock')}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="destructive"
          onClick={() =>
            setRequest(
              target.type === 'product'
                ? { kind: 'hideProduct', id: target.id, label: target.label }
                : { kind: 'hideEvent', id: target.id, label: target.label }
            )
          }
        >
          {target.type === 'product'
            ? t('moderate.hideProductButton')
            : t('moderate.hideEventButton')}
        </Button>
      )}
      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
