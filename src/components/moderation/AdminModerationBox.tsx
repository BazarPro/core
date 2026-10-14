import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '../ui/button';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { ModerationActionDialog, type ModerationRequest } from './ModerationActionDialog';

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
  const isAdmin = useQuery(api.moderation.isViewerAdmin, {});
  const restoreProduct = useMutation(api.moderation.restoreProduct);
  const restoreEvent = useMutation(api.moderation.restoreEvent);
  const [request, setRequest] = useState<ModerationRequest | null>(null);

  if (!isAdmin) return null;

  const restore = async () => {
    try {
      if (target.type === 'product') await restoreProduct({ productId: target.id });
      else await restoreEvent({ eventId: target.id });
      toast.success('Einschränkung aufgehoben');
    } catch (error) {
      toast.error('Fehler', { description: getUserFacingErrorMessage(error) });
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
          {target.hidden ? 'Derzeit ausgeblendet.' : 'Für alle sichtbar.'}
        </p>
      ) : (
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Moderation
        </div>
      )}
      {target.hidden ? (
        <Button size="sm" variant="secondary" onClick={restore}>
          {target.type === 'product' ? 'Wieder einblenden' : 'Sperre aufheben'}
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
          {target.type === 'product' ? 'Artikel ausblenden' : 'Veranstaltung sperren'}
        </Button>
      )}
      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
