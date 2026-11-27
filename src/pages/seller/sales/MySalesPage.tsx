import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { useApiClient, useQuery } from '../../../lib/api/react';
import { CheckCircle2, Clock, Download, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api/functions';
import type { Id } from '../../../lib/api/types';
import type { SaleInfo } from '../../../lib/api/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { StorageImage } from '../../../components/ui/StorageImage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { downloadPrivateInvoiceForProduct } from '../../../lib/privateInvoice';
import { priceSourceLabel, sellerKeeps, type InvoiceCopy } from '../../../lib/saleBreakdown';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { formatPrice } from '../../../lib/utils';
import { useMarkNoticesSeen } from '../../../hooks/useMarkNoticesSeen';
import { useTranslation } from 'react-i18next';
import { InfoTip } from '../../../components/ui/info-tip';
import { dateLocale } from '../../../i18n/format';
import { ListSkeleton, Loading } from '../../../components/ui/loading';

/** The seller's sold items per bazaar, with fee, payout and whether it was paid out. */
export function MySalesPage() {
  const { t } = useTranslation('sales');
  useMarkNoticesSeen('sales');
  const groups = useQuery(api.purchases.getMySales, {});
  const client = useApiClient();

  const download = async (
    eventId: Id<'events'>,
    item: { title: string; description: string; images: Id<'_storage'>[]; sale: SaleInfo },
    copy: InvoiceCopy
  ) => {
    try {
      await downloadPrivateInvoiceForProduct({
        client,
        eventId,
        product: item,
        sale: item.sale,
        copy,
      });
    } catch (error) {
      toast.error(t('mySales.invoiceFailed'), {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  return (
    <div className="page-wide space-y-6 pb-10">
      <PageHeader title={t('mySales.title')} />

      {groups === undefined ? (
        <Loading>
          <ListSkeleton rows={4} />
        </Loading>
      ) : groups.length === 0 ? (
        <EmptyState icon={Receipt} title={t('mySales.empty')} />
      ) : (
        groups.map((group) => {
          // With an intake fee and few sales the seller pays the bazaar instead
          const owes = group.totals.payout < -0.005;
          // Direct sales can leave nothing to hand over in either direction
          const even = Math.abs(group.totals.payout) < 0.005;
          // Direct sales: the buyer paid the seller, who paid the commission at the desk
          const keptDirectly = group.items
            .filter((item) => item.sale.directSale)
            .reduce((sum, item) => sum + sellerKeeps(item.sale), 0);
          return (
            <section
              key={group.event._id}
              className="overflow-hidden rounded-xl border bg-card shadow-xs"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold">{group.event.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(group.event.startDate).toLocaleDateString(dateLocale())} ·{' '}
                    {group.sellerNumber
                      ? t('mySales.yourNumber', { number: group.sellerNumber })
                      : ''}
                    {t('mySales.soldCount', { count: group.items.length })}
                  </p>
                </div>
                {even && !group.paid ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('mySales.even')}
                  </Badge>
                ) : group.paid ? (
                  <Badge variant="success">
                    <CheckCircle2 className="h-3.5 w-3.5" />{' '}
                    {owes ? t('mySales.paidFee') : t('mySales.paid')}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3.5 w-3.5" />{' '}
                    {owes ? t('mySales.payFee') : t('mySales.pickUp')}
                  </Badge>
                )}
              </header>

              {group.items.length === 0 && (
                <p className="flex items-center gap-1 px-5 py-4 text-sm text-muted-foreground">
                  {t('mySales.nothingSold')}
                  <InfoTip>{t('mySales.nothingSoldInfo')}</InfoTip>
                </p>
              )}
              <ul className="divide-y">
                {group.items.map((item) => {
                  const reduced = item.sale.totalAmount < item.sale.listPrice - 0.005;
                  return (
                    <li
                      key={item.purchaseId}
                      className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {item.images[0] && (
                            <StorageImage
                              storageId={item.images[0]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.sale.soldAt).toLocaleString(dateLocale(), {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                            {reduced && (
                              <>
                                {' · '}
                                <span className="line-through">
                                  {formatPrice(item.sale.listPrice)} €
                                </span>{' '}
                                {priceSourceLabel(item.sale)}
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 sm:justify-end">
                        <dl className="grid grid-cols-3 gap-4 text-right text-sm tabular-nums [&_dd]:whitespace-nowrap">
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              {t('mySales.soldFor')}
                            </dt>
                            <dd className="font-medium">{formatPrice(item.sale.totalAmount)} €</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t('mySales.fee')}</dt>
                            <dd>
                              {item.sale.commission > 0 ? '−' : ''}
                              {formatPrice(item.sale.commission)} €
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              {item.sale.directSale
                                ? t('mySales.receivedDirectly')
                                : t('mySales.forYou')}
                            </dt>
                            <dd className="font-semibold text-primary">
                              {formatPrice(sellerKeeps(item.sale))} €
                            </dd>
                          </div>
                        </dl>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" aria-label={t('mySales.invoice')}>
                              <Download className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => download(group.event._id, item, 'buyer')}
                            >
                              {t('mySales.invoiceBuyer')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => download(group.event._id, item, 'seller')}
                            >
                              {t('mySales.invoiceSeller')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <footer className="border-t bg-muted/20 px-5 py-4">
                <dl className="ml-auto max-w-sm space-y-1 text-sm tabular-nums [&_dd]:whitespace-nowrap">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('mySales.totalSold')}</dt>
                    <dd>{formatPrice(group.totals.revenue)} €</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {group.event.feeGroup
                        ? t('mySales.bazaarFeeGroup', {
                            percent: group.event.commissionPercent,
                            group: group.event.feeGroup,
                          })
                        : t('mySales.bazaarFee', { percent: group.event.commissionPercent })}
                    </dt>
                    <dd>
                      {group.totals.commission > 0 ? '−' : ''}
                      {formatPrice(group.totals.commission)} €
                    </dd>
                  </div>
                  {keptDirectly > 0.005 && (
                    <div className="flex justify-between">
                      <dt className="flex items-center gap-1 text-muted-foreground">
                        {t('mySales.keptDirectly')}
                        <InfoTip>{t('mySales.keptDirectlyInfo')}</InfoTip>
                      </dt>
                      <dd>−{formatPrice(keptDirectly)} €</dd>
                    </div>
                  )}
                  {group.totals.intakeFee.total > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        {t('mySales.intakeFee', {
                          items: group.totals.intakeFee.items,
                          perItem: formatPrice(group.totals.intakeFee.perItem),
                        })}
                      </dt>
                      <dd>−{formatPrice(group.totals.intakeFee.total)} €</dd>
                    </div>
                  )}
                  {group.totals.feeCapCredit > 0 && (
                    <div className="flex justify-between text-success-soft-foreground">
                      <dt>{t('mySales.feeCap')}</dt>
                      <dd>+{formatPrice(group.totals.feeCapCredit)} €</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 text-base font-bold">
                    <dt>
                      {even && !group.paid
                        ? t('mySales.even')
                        : owes
                          ? group.paid
                            ? t('mySales.paidFee')
                            : t('mySales.youPay')
                          : group.paid
                            ? t('mySales.paid')
                            : t('mySales.youGet')}
                    </dt>
                    {/* Money to pay in the colour of a due step, money to get in petrol */}
                    <dd
                      className={
                        owes && !group.paid ? 'text-warning-soft-foreground' : 'text-primary'
                      }
                    >
                      {formatPrice(Math.abs(group.totals.payout))} €
                    </dd>
                  </div>
                </dl>
              </footer>
            </section>
          );
        })
      )}
    </div>
  );
}
