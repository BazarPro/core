import { useQuery } from 'convex/react';
import { useParams } from 'react-router-dom';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Banknote, CheckCircle2, Users } from 'lucide-react';
import { formatPriceDE } from '../../../../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Progress } from '../../../../components/ui/progress';

/**
 * What should be in the cash box right now, and whose money it is:
 * cash = sales − payouts so far = payouts still due + commission + intake fees.
 */
export function CashReconciliationPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const summary = useQuery(api.events.getEventFinancialSummary, {
    eventId: eventId as Id<'events'>,
  });

  if (!summary) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  const allPaid =
    summary.vendorsTotalCount > 0 && summary.vendorsPaidCount === summary.vendorsTotalCount;
  const payoutProgress =
    summary.vendorsTotalCount > 0
      ? (summary.vendorsPaidCount / summary.vendorsTotalCount) * 100
      : 0;

  return (
    <div className="container mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-bold">Kassensturz</h1>
        <p className="text-muted-foreground text-sm">
          So viel Bargeld sollte jetzt in der Kasse sein, und so teilt es sich auf.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-6 pt-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground">In der Kasse sollten sein</p>
            <p className="flex items-center gap-3 text-5xl font-black tabular-nums text-primary">
              <Banknote className="h-10 w-10" />
              {formatPriceDE(summary.cashInHandSoll)} €
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="rounded-xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">Noch an Verkäufer auszuzahlen</p>
              <p className="text-2xl font-bold tabular-nums">
                {formatPriceDE(summary.totalPendingPayout)} €
              </p>
            </div>
            <span className="text-center text-2xl font-bold text-muted-foreground">+</span>
            <div className="rounded-xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">
                {summary.totalIntakeFees > 0
                  ? 'Provision und Annahmegebühren (bleiben beim Veranstalter)'
                  : 'Provision (bleibt beim Veranstalter)'}
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {formatPriceDE(summary.totalCommission + summary.totalIntakeFees)} €
              </p>
              {summary.totalIntakeFees > 0 && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {formatPriceDE(summary.totalCommission)} € Provision +{' '}
                  {formatPriceDE(summary.totalIntakeFees)} € Annahmegebühren
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">So kommt der Betrag zustande</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt>
                  Einnahmen aus {summary.salesCount}{' '}
                  {summary.salesCount === 1 ? 'Verkauf' : 'Verkäufen'}
                </dt>
                <dd className="font-medium">{formatPriceDE(summary.totalNetRevenue)} €</dd>
              </div>
              <div className="flex justify-between">
                <dt>Bereits an Verkäufer ausgezahlt</dt>
                <dd className="font-medium">
                  {summary.totalPaidOut > 0 ? '−' : ''}
                  {formatPriceDE(summary.totalPaidOut)} €
                </dd>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-bold">
                <dt>In der Kasse</dt>
                <dd>{formatPriceDE(summary.cashInHandSoll)} €</dd>
              </div>
            </dl>
            {summary.totalDiscounts > 0.005 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Gegenüber den Etikettenpreisen ({formatPriceDE(summary.totalGrossRevenue)} €) wurden{' '}
                {formatPriceDE(summary.totalDiscounts)} € an Rabatten und Preisnachlässen gewährt.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-muted-foreground" />
              Abrechnungen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {summary.vendorsPaidCount} von {summary.vendorsTotalCount} Verkäufern abgerechnet
                </span>
                <span className="font-medium">{payoutProgress.toFixed(0)} %</span>
              </div>
              <Progress value={payoutProgress} className="h-2" />
            </div>
            <dl className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Ausgezahlt</dt>
                <dd className="font-medium">{formatPriceDE(summary.totalPaidOut)} €</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Noch offen</dt>
                <dd className="font-medium">{formatPriceDE(summary.totalPendingPayout)} €</dd>
              </div>
            </dl>
            {allPaid && (
              <p className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Alle Verkäufer sind abgerechnet. In der Kasse bleibt die Provision.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
