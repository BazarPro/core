import { PageHeader } from '../../../../components/ui/page-header';
import { useQuery } from '../../../../lib/api/react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../../../components/ui/button';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../lib/api/types';
import { ArrowRight, Banknote, CheckCircle2, Users } from 'lucide-react';
import { formatPrice } from '../../../../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Progress } from '../../../../components/ui/progress';
import { useTranslation } from 'react-i18next';
import { ProofOfOffersCard } from './components/ProofOfOffersCard';
import { SettlementExportCard } from './components/SettlementExportCard';
import { SaleConflictsCard } from './components/SaleConflictsCard';
import { PageSkeleton } from '../../../../components/ui/loading';
import { useEventAccess } from '../../../../hooks/useEventAccess';
import { InfoTip } from '../../../../components/ui/info-tip';

/**
 * What should be in the cash box right now, and whose money it is:
 * cash = sales − payouts so far + intake fees paid in
 *      = payouts still due − intake fees still to collect + commission + intake fees.
 */
export function CashReconciliationPage() {
  const { t } = useTranslation('organizer');
  const { eventId } = useParams<{ eventId: string }>();
  const { isLoading, can } = useEventAccess(eventId as Id<'events'>);
  const summary = useQuery(
    api.events.getEventFinancialSummary,
    can('cashSummary') ? { eventId: eventId as Id<'events'> } : 'skip'
  );

  if (isLoading) return <PageSkeleton className="pb-10" />;
  // Helpers without the cash summary still settle the offline sales the desk could not book
  if (!can('cashSummary')) {
    return (
      <div className="page-wide space-y-6 pb-10">
        <PageHeader title={t('cash.title')} />
        {can('sale') && <SaleConflictsCard eventId={eventId as Id<'events'>} />}
        <p className="p-8 text-center text-muted-foreground">
          {t('helper.cashSummary', { ns: 'errors' })}
        </p>
      </div>
    );
  }
  if (!summary) {
    return <PageSkeleton className="pb-10" />;
  }

  const allPaid =
    summary.vendorsTotalCount > 0 && summary.vendorsPaidCount === summary.vendorsTotalCount;
  const collecting = summary.totalFeesToCollect > 0.005;
  // Older backends do not send it
  const capCredits = summary.totalFeeCapCredits ?? 0;
  // Direct sale: the sellers have their money, so there may be nobody to settle
  const nothingToSettle = summary.vendorsTotalCount === 0 && summary.totalDirectSales > 0.005;
  const payoutProgress =
    summary.vendorsTotalCount > 0
      ? (summary.vendorsPaidCount / summary.vendorsTotalCount) * 100
      : 0;

  return (
    <div className="page-wide space-y-6 pb-10">
      <PageHeader title={t('cash.title')} />

      {can('sale') && <SaleConflictsCard eventId={eventId as Id<'events'>} />}

      {/* The one figure that matters, how it splits up, and the one thing to do */}
      <Card>
        <CardContent className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start">
          <div className="space-y-5">
            <div>
              <p className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                {t('cash.shouldBe')}
                <InfoTip label={t('cash.howTitle')}>
                  <span className="block font-semibold">{t('cash.howTitle')}</span>
                  <span className="mt-1 block tabular-nums">
                    {t('cash.income', { count: summary.salesCount })}:{' '}
                    {formatPrice(summary.totalNetRevenue)} €
                    {summary.totalDirectSales > 0.005 &&
                      ` · ${t('cash.directSales')}: −${formatPrice(summary.totalDirectSales - summary.totalDirectCommission)} €`}
                    {' · '}
                    {t('cash.paidOut')}: −{formatPrice(summary.totalPaidOut)} €
                    {summary.totalFeesCollected > 0.005 &&
                      ` · ${t('cash.feesCollectedIncome')}: +${formatPrice(summary.totalFeesCollected)} €`}
                  </span>
                  {summary.totalDiscounts > 0.005 && (
                    <span className="mt-1 block">
                      {t('cash.discounts', {
                        gross: formatPrice(summary.totalGrossRevenue),
                        discounts: formatPrice(summary.totalDiscounts),
                      })}
                    </span>
                  )}
                </InfoTip>
              </p>
              <p className="mt-1 flex items-center gap-3 whitespace-nowrap text-3xl font-extrabold tabular-nums min-[360px]:text-4xl sm:text-5xl">
                <Banknote className="h-8 w-8 shrink-0 text-primary sm:h-10 sm:w-10" />
                {formatPrice(summary.cashInHandSoll)} €
              </p>
            </div>
            {/* The one thing to do here: pay the sellers still waiting */}
            {!allPaid && !nothingToSettle && summary.vendorsTotalCount > 0 && (
              // Wraps on narrow phones instead of sticking out of the card
              <Button asChild size="lg" className="h-auto min-h-11 whitespace-normal max-sm:w-full">
                <Link to={`/events/view/${eventId}/sellers`} state={{ filter: 'open' }}>
                  <Users className="h-5 w-5" />
                  {t('cash.settleNow', {
                    count: summary.vendorsTotalCount - summary.vendorsPaidCount,
                  })}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>

          {/* What the sum is made of, read like a receipt */}
          <dl className="divide-y rounded-xl border bg-muted/40 text-sm tabular-nums">
            <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">
              {t('cash.breakdown')}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-3">
              <dt>{t('cash.pending')}</dt>
              <dd className="whitespace-nowrap text-base font-semibold">
                {formatPrice(summary.totalPendingPayout)} €
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-3">
              <dt>
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true" className="text-muted-foreground">
                    +
                  </span>
                  {summary.totalIntakeFees > 0 ? t('cash.commissionAndFees') : t('cash.commission')}
                  <InfoTip>
                    {t('cash.keepsInfo')}
                    {summary.totalIntakeFees > 0 &&
                      ' ' +
                        t('cash.split', {
                          commission: formatPrice(summary.totalCommission),
                          fees: formatPrice(summary.totalIntakeFees),
                        })}
                  </InfoTip>
                </span>
                {capCredits > 0 && (
                  <span className="mt-0.5 block text-xs text-success-soft-foreground">
                    {t('cash.capSplit', { amount: formatPrice(capCredits) })}
                  </span>
                )}
              </dt>
              <dd className="whitespace-nowrap text-base font-semibold">
                {formatPrice(summary.totalCommission + summary.totalIntakeFees - capCredits)} €
              </dd>
            </div>
            {collecting && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-3 text-warning-soft-foreground">
                <dt>
                  <span aria-hidden="true" className="mr-1">
                    −
                  </span>
                  {t('cash.feesToCollect')}
                </dt>
                <dd className="whitespace-nowrap text-base font-semibold">
                  {formatPrice(summary.totalFeesToCollect)} €
                </dd>
              </div>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-3 font-semibold">
              <dt>
                <span aria-hidden="true" className="mr-1 text-muted-foreground">
                  =
                </span>
                {t('cash.shouldBe')}
              </dt>
              <dd className="whitespace-nowrap text-base">
                {formatPrice(summary.cashInHandSoll)} €
              </dd>
            </div>
          </dl>
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
          {nothingToSettle ? (
            <p className="flex items-start gap-2 rounded-lg bg-success-soft p-3 text-sm text-success-soft-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {t('cash.directNoPayout')}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm tabular-nums">
                <span className="font-medium">
                  {t('cash.progress', {
                    paid: summary.vendorsPaidCount,
                    total: summary.vendorsTotalCount,
                  })}
                </span>
                <span className="text-muted-foreground">
                  {t('cash.paid')} {formatPrice(summary.totalPaidOut)} € · {t('cash.open')}{' '}
                  {formatPrice(summary.totalPendingPayout)} €
                </span>
              </div>
              <Progress value={payoutProgress} className="h-2" />
            </div>
          )}
          {collecting && (
            <div className="rounded-lg border border-warning-soft-foreground/30 bg-warning-soft p-3 text-sm text-warning-soft-foreground">
              <p className="mb-2 flex items-center gap-1 font-semibold">
                {t('cash.sellersToCollect')}
                <InfoTip>{t('cash.sellersToCollectInfo')}</InfoTip>
              </p>
              <ul className="grid grid-cols-1 gap-x-8 gap-y-1 tabular-nums sm:grid-cols-2">
                {summary.sellersToCollect.map((seller, index) => (
                  <li key={index} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {seller.sellerNumber
                        ? `${t('cash.sellerNumber', { number: seller.sellerNumber })} · `
                        : ''}
                      {seller.name}
                    </span>
                    <span className="whitespace-nowrap font-medium">
                      {formatPrice(seller.amount)} €
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {allPaid && (
            <p className="flex items-start gap-2 rounded-lg bg-success-soft p-3 text-sm text-success-soft-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {summary.totalIntakeFees > 0 ? t('cash.allPaidWithFees') : t('cash.allPaid')}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <SettlementExportCard eventId={eventId as Id<'events'>} />
        <ProofOfOffersCard eventId={eventId as Id<'events'>} />
      </div>
    </div>
  );
}
