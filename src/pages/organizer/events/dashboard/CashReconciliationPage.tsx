import { useQuery } from 'convex/react';
import { useParams } from 'react-router-dom';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Banknote, CheckCircle2, Users } from 'lucide-react';
import { formatPriceDE } from '../../../../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Progress } from '../../../../components/ui/progress';
import { useTranslation } from 'react-i18next';

/**
 * What should be in the cash box right now, and whose money it is:
 * cash = sales − payouts so far + intake fees paid in
 *      = payouts still due − intake fees still to collect + commission + intake fees.
 */
export function CashReconciliationPage() {
  const { t } = useTranslation('organizer');
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
  const collecting = summary.totalFeesToCollect > 0.005;
  const payoutProgress =
    summary.vendorsTotalCount > 0
      ? (summary.vendorsPaidCount / summary.vendorsTotalCount) * 100
      : 0;

  return (
    <div className="container mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-bold">{t('cash.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('cash.subtitle')}</p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-6 pt-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('cash.shouldBe')}</p>
            <p className="flex items-center gap-3 text-5xl font-black tabular-nums text-primary">
              <Banknote className="h-10 w-10" />
              {formatPriceDE(summary.cashInHandSoll)} €
            </p>
          </div>

          <div
            className={`grid gap-3 sm:items-center ${
              collecting ? 'sm:grid-cols-[1fr_auto_1fr_auto_1fr]' : 'sm:grid-cols-[1fr_auto_1fr]'
            }`}
          >
            <div className="rounded-xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">{t('cash.pending')}</p>
              <p className="text-2xl font-bold tabular-nums">
                {formatPriceDE(summary.totalPendingPayout)} €
              </p>
            </div>
            <span className="text-center text-2xl font-bold text-muted-foreground">+</span>
            <div className="rounded-xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">
                {summary.totalIntakeFees > 0 ? t('cash.commissionAndFees') : t('cash.commission')}
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {formatPriceDE(summary.totalCommission + summary.totalIntakeFees)} €
              </p>
              {summary.totalIntakeFees > 0 && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {t('cash.split', {
                    commission: formatPriceDE(summary.totalCommission),
                    fees: formatPriceDE(summary.totalIntakeFees),
                  })}
                </p>
              )}
            </div>
            {collecting && (
              <>
                <span className="text-center text-2xl font-bold text-muted-foreground">−</span>
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="text-sm text-muted-foreground">
                    {summary.sellerCollects
                      ? t('cash.commissionToCollect')
                      : t('cash.feesToCollect')}
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    {formatPriceDE(summary.totalFeesToCollect)} €
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('cash.howTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt>{t('cash.income', { count: summary.salesCount })}</dt>
                <dd className="font-medium">{formatPriceDE(summary.totalNetRevenue)} €</dd>
              </div>
              {summary.totalCollectedBySellers > 0.005 && (
                <div className="flex justify-between">
                  <dt>{t('cash.collectedBySellers')}</dt>
                  <dd className="font-medium">
                    −{formatPriceDE(summary.totalCollectedBySellers)} €
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>{t('cash.paidOut')}</dt>
                <dd className="font-medium">
                  {summary.totalPaidOut > 0 ? '−' : ''}
                  {formatPriceDE(summary.totalPaidOut)} €
                </dd>
              </div>
              {summary.totalFeesCollected > 0.005 && (
                <div className="flex justify-between">
                  <dt>
                    {summary.sellerCollects
                      ? t('cash.commissionCollectedIncome')
                      : t('cash.feesCollectedIncome')}
                  </dt>
                  <dd className="font-medium">+{formatPriceDE(summary.totalFeesCollected)} €</dd>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 text-base font-bold">
                <dt>{t('cash.inCash')}</dt>
                <dd>{formatPriceDE(summary.cashInHandSoll)} €</dd>
              </div>
            </dl>
            {summary.totalDiscounts > 0.005 && (
              <p className="mt-4 text-xs text-muted-foreground">
                {t('cash.discounts', {
                  gross: formatPriceDE(summary.totalGrossRevenue),
                  discounts: formatPriceDE(summary.totalDiscounts),
                })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-muted-foreground" />
              {t('cash.settlements')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {t('cash.progress', {
                    paid: summary.vendorsPaidCount,
                    total: summary.vendorsTotalCount,
                  })}
                </span>
                <span className="font-medium">{payoutProgress.toFixed(0)} %</span>
              </div>
              <Progress value={payoutProgress} className="h-2" />
            </div>
            <dl className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('cash.paid')}</dt>
                <dd className="font-medium">{formatPriceDE(summary.totalPaidOut)} €</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('cash.open')}</dt>
                <dd className="font-medium">{formatPriceDE(summary.totalPendingPayout)} €</dd>
              </div>
              {summary.totalFeesCollected > 0.005 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {summary.sellerCollects
                      ? t('cash.commissionCollected')
                      : t('cash.feesCollected')}
                  </dt>
                  <dd className="font-medium">{formatPriceDE(summary.totalFeesCollected)} €</dd>
                </div>
              )}
              {collecting && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {summary.sellerCollects ? t('cash.commissionOpen') : t('cash.feesOpen')}
                  </dt>
                  <dd className="font-medium">{formatPriceDE(summary.totalFeesToCollect)} €</dd>
                </div>
              )}
            </dl>
            {collecting && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                <p className="mb-2 font-medium">
                  {summary.sellerCollects
                    ? t('cash.sellersOweCommission')
                    : t('cash.sellersToCollect')}
                </p>
                <ul className="space-y-1 tabular-nums">
                  {summary.sellersToCollect.map((seller, index) => (
                    <li key={index} className="flex justify-between gap-3">
                      <span>
                        {seller.sellerNumber
                          ? `${t('cash.sellerNumber', { number: seller.sellerNumber })} · `
                          : ''}
                        {seller.name}
                      </span>
                      <span className="font-medium">{formatPriceDE(seller.amount)} €</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {allPaid && (
              <p className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {summary.totalIntakeFees > 0 ? t('cash.allPaidWithFees') : t('cash.allPaid')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
