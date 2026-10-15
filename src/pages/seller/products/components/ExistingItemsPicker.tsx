import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { History } from 'lucide-react';
import { api } from '../../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '../../../../components/ui/button';
import { Checkbox } from '../../../../components/ui/checkbox';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { formatPriceDE } from '../../../../lib/utils';
import { useTranslation } from 'react-i18next';

/**
 * The seller's items that are not registered for this bazaar yet – typically what
 * was left over from the last one – to register several of them at once.
 */
export function ExistingItemsPicker({
  event,
  photosRequired,
}: {
  event: Doc<'events'>;
  photosRequired: boolean;
}) {
  const { t } = useTranslation('seller');
  const products = useQuery(api.products.getMyProducts);
  const addExisting = useMutation(api.products.addExistingProductsToEvent);
  const [selected, setSelected] = useState<Set<Id<'products'>>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const candidates = useMemo(
    () =>
      (products ?? [])
        .filter(
          (product) => !product.sold && !product.isLocked && !product.eventIds.includes(event._id)
        )
        .sort((a, b) => b._creationTime - a._creationTime),
    [products, event._id]
  );
  if (candidates.length === 0) return null;

  const selectable = candidates.filter((product) => !photosRequired || product.images.length > 0);
  const toggle = (id: Id<'products'>, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const chosen = selectable.filter((product) => selected.has(product._id));

  const register = async () => {
    setIsSaving(true);
    try {
      const count = await addExisting({
        eventId: event._id,
        productIds: chosen.map((product) => product._id),
      });
      toast.success(t('existing.registered', { count, event: event.title }));
      setSelected(new Set());
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <History className="h-4 w-4 text-muted-foreground" />
        {t('existing.summary', { count: candidates.length })}
        <span className="text-sm font-normal text-muted-foreground">{t('existing.hint')}</span>
      </summary>
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            id="existing-all"
            checked={chosen.length > 0 && chosen.length === selectable.length}
            onCheckedChange={(checked) =>
              setSelected(checked ? new Set(selectable.map((product) => product._id)) : new Set())
            }
          />
          <label htmlFor="existing-all" className="cursor-pointer">
            {t('existing.all')}
          </label>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {candidates.map((product) => {
            const disabled = photosRequired && product.images.length === 0;
            const id = `existing-${product._id}`;
            return (
              <li key={product._id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={id}
                  disabled={disabled}
                  checked={selected.has(product._id)}
                  onCheckedChange={(checked) => toggle(product._id, !!checked)}
                />
                <label
                  htmlFor={id}
                  className={`flex flex-1 cursor-pointer justify-between gap-2 ${disabled ? 'text-muted-foreground' : ''}`}
                >
                  <span className="truncate">
                    {product.title}
                    {disabled && t('existing.noPhoto')}
                  </span>
                  <span className="tabular-nums">{formatPriceDE(product.price)} €</span>
                </label>
              </li>
            );
          })}
        </ul>
        <Button onClick={register} disabled={chosen.length === 0 || isSaving}>
          {t('existing.register', { count: chosen.length, event: event.title })}
        </Button>
      </div>
    </details>
  );
}
