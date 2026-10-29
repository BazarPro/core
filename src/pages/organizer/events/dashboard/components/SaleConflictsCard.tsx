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
import i18n from '../../../../../i18n';
import { getUserFacingErrorMessage, translateAppError } from '../../../../../lib/errors';
import { formatPriceDE } from '../../../../../lib/utils';

/**
 * What the team did offline and the backend could not book afterwards: sales of items
 * sold at two desks (the buyer has paid, the money is in the till) and refused intake
 * actions (lib/offlineActions.ts). The team settles each one by hand. Shows nothing while
 * there is none.
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
  const failed = useQuery(api.offline.getFailedActions, { eventId });
  const resolveSale = useMutation(api.purchases.resolveSaleConflict);
  const resolveAction = useMutation(api.offline.resolveFailedAction);
  const [resolving, setResolving] = useState<string | null>(null);

  const rows: Row[] = [
    ...(conflicts ?? [])
      .filter((conflict) => conflict.resolvedAt === undefined)
      .map((conflict) => ({
        id: conflict._id,
        title: conflict.title,
        detail: t(`conflicts.reason.${reasonKey(conflict.reason)}`),
        at: conflict.soldAt,
        who: conflict.cashier,
        amount: conflict.amount,
        resolve: () => resolveSale({ conflictId: conflict._id }),
      })),
    ...(failed ?? [])
      .filter((action) => action.resolvedAt === undefined)
      .map((action) => ({
        id: action._id,
        title: action.label || t('conflicts.action'),
        detail: t('conflicts.actionRefused', { reason: refusalText(action) }),
        at: action.doneAt,
        who: action.userName,
        resolve: () => resolveAction({ actionId: action._id }),
      })),
  ];
  if (rows.length === 0) return null;

  const onResolve = async (row: Row) => {
    setResolving(row.id);
    try {
      await row.resolve();
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
          {t('conflicts.title', { count: rows.length })}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t('conflicts.text')}</p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border bg-background">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium">{row.title}</p>
                <p className="text-sm text-muted-foreground">
                  {row.detail} ·{' '}
                  {new Date(row.at).toLocaleString(dateLocale(), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {row.who && <> · {row.who}</>}
                </p>
              </div>
              {row.amount !== undefined && (
                <span className="whitespace-nowrap font-semibold tabular-nums">
                  {formatPriceDE(row.amount)} €
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                loading={resolving === row.id}
                disabled={resolving !== null}
                onClick={() => void onResolve(row)}
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

/** One thing to settle: a sale that could not be booked or a refused offline action. */
type Row = {
  id: string;
  title: string;
  detail: string;
  at: number;
  who?: string;
  /** Money taken for a sale */
  amount?: number;
  resolve: () => Promise<unknown>;
};

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

/**
 * Why the backend refused an offline action, in the app's language. Rows from before the
 * backend kept the parameters, and codes the app has no text for, show the stored text.
 */
function refusalText(action: {
  error: string;
  errorMessage: string;
  errorParams?: Record<string, string | number>;
  errorCause?: { code: string; params?: Record<string, string | number> };
}): string {
  if (!action.errorParams || !i18n.exists(action.error, { ns: 'errors' })) {
    return action.errorMessage;
  }
  return translateAppError({
    code: action.error,
    params: action.errorParams,
    cause: action.errorCause,
  });
}
