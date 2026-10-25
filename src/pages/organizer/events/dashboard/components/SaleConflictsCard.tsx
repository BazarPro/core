import { AlertTriangle, Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card';
import { dateLocale } from '../../../../../i18n/format';
import { api } from '../../../../../lib/api/functions';
import { useMutation, useQuery } from '../../../../../lib/api/react';
import type { Id } from '../../../../../lib/api/types';
import { getUserFacingErrorMessage } from '../../../../../lib/errors';
import { formatPriceDE } from '../../../../../lib/utils';

/**
 * Items of offline sales that could not be booked, e.g. sold at two desks. The buyer has
 * paid, so the money is in the till; the team settles each one by hand. Shows nothing
 * while there is no open conflict.
 */
export function SaleConflictsCard({
  eventId,
  className = '',
}: {
  eventId: Id<'events'>;
  className?: string;
}) {
  const { t } = useTranslation('organizer');
  const conflicts = useQuery(api.purchases.getSaleConflicts, { eventId });
  const resolve = useMutation(api.purchases.resolveSaleConflict);
  const [resolving, setResolving] = useState<string | null>(null);

  const open = conflicts?.filter((conflict) => conflict.resolvedAt === undefined) ?? [];
  if (open.length === 0) return null;

  const onResolve = async (conflictId: string) => {
    setResolving(conflictId);
    try {
      await resolve({ conflictId });
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setResolving(null);
    }
  };

  return (
    <Card
      className={`border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30 ${className}`}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          {t('conflicts.title', { count: open.length })}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t('conflicts.text')}</p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border bg-background">
          {open.map((conflict) => (
            <li key={conflict._id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium">{conflict.title}</p>
                <p className="text-sm text-muted-foreground">
                  {t(`conflicts.reason.${reasonKey(conflict.reason)}`)} ·{' '}
                  {new Date(conflict.soldAt).toLocaleString(dateLocale(), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {conflict.cashier && <> · {conflict.cashier}</>}
                </p>
              </div>
              <span className="whitespace-nowrap font-semibold tabular-nums">
                {formatPriceDE(conflict.amount)} €
              </span>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                loading={resolving === conflict._id}
                disabled={resolving !== null}
                onClick={() => void onResolve(conflict._id)}
              >
                <Check className="h-4 w-4" />
                {t('conflicts.resolve')}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** The error code of the backend (purchases.rs) as a text key. */
function reasonKey(reason: string): 'sold' | 'sellerPaid' | 'gone' | 'other' {
  switch (reason) {
    case 'product.notForSale':
      return 'sold';
    case 'seller.paidOutNoSales':
      return 'sellerPaid';
    case 'notFound.product':
      return 'gone';
    default:
      return 'other';
  }
}
