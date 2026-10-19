import { useConvex, useQuery } from 'convex/react';
import { CheckCircle2, Clock, Download, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { SaleInfo } from '../../../../convex/sales';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ConvexImage } from '../../../components/ui/ConvexImage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { downloadPrivateInvoiceForProduct } from '../../../lib/privateInvoice';
import { priceSourceLabel, type InvoiceCopy } from '../../../lib/saleBreakdown';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { formatPriceDE } from '../../../lib/utils';
import { useMarkNoticesSeen } from '../../../hooks/useMarkNoticesSeen';

/** The seller's sold items per bazaar, with fee, payout and whether it was paid out. */
export function MySalesPage() {
  useMarkNoticesSeen('sales');
  const groups = useQuery(api.purchases.getMySales, {});
  const convex = useConvex();

  const download = async (
    eventId: Id<'events'>,
    item: { title: string; description: string; images: Id<'_storage'>[]; sale: SaleInfo },
    copy: InvoiceCopy
  ) => {
    try {
      await downloadPrivateInvoiceForProduct({
        convex,
        eventId,
        product: item,
        sale: item.sale,
        copy,
      });
    } catch (error) {
      toast.error('Privatrechnung konnte nicht erstellt werden', {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  return (
    <div className="container mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-bold">Meine Verkäufe</h1>
        <p className="text-sm text-muted-foreground">
          Was du verkauft hast und was du vom Veranstalter ausgezahlt bekommst.
        </p>
      </div>

      {groups === undefined ? (
        <div className="flex justify-center py-20">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-16 text-center text-muted-foreground">
          <Receipt className="mx-auto mb-3 h-10 w-10 opacity-40" />
          Noch nichts verkauft. Sobald ein Artikel an der Kasse verkauft ist, steht er hier.
        </div>
      ) : (
        groups.map((group) => (
          <section
            key={group.event._id}
            className="overflow-hidden rounded-2xl border bg-card shadow-sm"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">{group.event.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {new Date(group.event.startDate).toLocaleDateString('de-DE')} ·{' '}
                  {group.sellerNumber ? `Deine Nummer ${group.sellerNumber} · ` : ''}
                  {group.items.length} Artikel verkauft
                </p>
              </div>
              {group.paid ? (
                <Badge className="gap-1 border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Ausgezahlt
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3.5 w-3.5" /> Auszahlung beim Veranstalter abholen
                </Badge>
              )}
            </header>

            <ul className="divide-y">
              {group.items.map((item) => {
                const reduced = item.sale.totalAmount < item.sale.listPrice - 0.005;
                return (
                  <li
                    key={item.productId}
                    className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {item.images[0] && (
                          <ConvexImage
                            storageId={item.images[0]}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.sale.soldAt).toLocaleString('de-DE', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                          {reduced && (
                            <>
                              {' · '}
                              <span className="line-through">
                                {formatPriceDE(item.sale.listPrice)} €
                              </span>{' '}
                              {priceSourceLabel(item.sale)}
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <dl className="grid grid-cols-3 gap-4 text-right text-sm tabular-nums">
                        <div>
                          <dt className="text-xs text-muted-foreground">Verkauft für</dt>
                          <dd className="font-medium">{formatPriceDE(item.sale.totalAmount)} €</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Gebühr</dt>
                          <dd>
                            {item.sale.commission > 0 ? '−' : ''}
                            {formatPriceDE(item.sale.commission)} €
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Für dich</dt>
                          <dd className="font-semibold text-primary">
                            {formatPriceDE(item.sale.payout)} €
                          </dd>
                        </div>
                      </dl>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" aria-label="Privatrechnung">
                            <Download className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => download(group.event._id, item, 'buyer')}
                          >
                            Privatrechnung für den Käufer
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => download(group.event._id, item, 'seller')}
                          >
                            Privatrechnung für mich (mit Bazar-Gebühr)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>

            <footer className="border-t bg-muted/20 px-5 py-4">
              <dl className="ml-auto max-w-sm space-y-1 text-sm tabular-nums">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Verkauft insgesamt</dt>
                  <dd>{formatPriceDE(group.totals.revenue)} €</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    Bazar-Gebühr ({group.event.commissionPercent} %)
                  </dt>
                  <dd>
                    {group.totals.commission > 0 ? '−' : ''}
                    {formatPriceDE(group.totals.commission)} €
                  </dd>
                </div>
                <div className="flex justify-between border-t pt-2 text-base font-bold">
                  <dt>{group.paid ? 'Ausgezahlt' : 'Du bekommst'}</dt>
                  <dd className="text-primary">{formatPriceDE(group.totals.payout)} €</dd>
                </div>
              </dl>
            </footer>
          </section>
        ))
      )}
    </div>
  );
}
