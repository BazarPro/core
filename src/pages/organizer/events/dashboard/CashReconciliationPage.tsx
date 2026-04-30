import { useQuery } from 'convex/react';
import { useParams } from 'react-router-dom';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import {
  Banknote,
  TrendingUp,
  Users,
  ShoppingCart,
  ArrowDownCircle,
  ArrowUpCircle,
  Info,
  ChevronDown,
  Package,
  Receipt,
} from 'lucide-react';
import { formatPriceDE } from '../../../../lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../../../../components/ui/card';
import { Progress } from '../../../../components/ui/progress';

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

  const payoutProgress =
    summary.vendorsTotalCount > 0
      ? (summary.vendorsPaidCount / summary.vendorsTotalCount) * 100
      : 0;

  return (
    <div className="container mx-auto space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold">Kassensturz</h1>
        <p className="text-muted-foreground text-sm">
          Finanzielle Übersicht und Bargeldbestand des Events
        </p>
      </div>

      {/* Main Cash Balance Card */}
      <Card className="border-2 border-primary/20 shadow-lg bg-primary/5">
        <CardHeader className="pb-2">
          <CardDescription className="uppercase font-bold tracking-wider text-xs">
            Aktueller Bargeldbestand (Soll)
          </CardDescription>
          <CardTitle className="text-5xl font-black text-primary flex items-center gap-4">
            <Banknote className="h-10 w-10" />
            {formatPriceDE(summary.cashInHandSoll)} €
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Dieser Betrag sollte sich aktuell in der Kasse befinden (Gesamtumsatz minus bereits
            getätigte Auszahlungen).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stats Cards */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase font-bold">Verkäufe</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              {summary.salesCount}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase font-bold">
              Netto-Umsatz
            </CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              {formatPriceDE(summary.totalNetRevenue)} €
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase font-bold text-destructive">
              Provision (Gewinn)
            </CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5 text-destructive" />
              {formatPriceDE(summary.totalCommission)} €
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase font-bold text-primary">
              Auszahlbetrag (Soll)
            </CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center gap-2 text-primary">
              <ArrowUpCircle className="h-5 w-5" />
              {formatPriceDE(summary.totalPayoutSoll)} €
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Revenue Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              Umsatz-Aufschlüsselung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" /> Brutto-Umsatz (Listenpreise)
                </span>
                <span className="font-bold">{formatPriceDE(summary.totalGrossRevenue)} €</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b text-amber-600">
                <span className="text-sm flex items-center gap-2 pl-4">
                  <ChevronDown className="h-4 w-4" /> Summe aller Rabatte
                </span>
                <span className="font-medium">-{formatPriceDE(summary.totalDiscounts)} €</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b bg-muted/30 px-2 rounded">
                <span className="text-sm font-bold">Netto-Umsatz (Effektiv)</span>
                <span className="font-black">{formatPriceDE(summary.totalNetRevenue)} €</span>
              </div>
              <div className="flex justify-between items-center py-2 text-destructive">
                <span className="text-sm flex items-center gap-2 pl-4">
                  <ChevronDown className="h-4 w-4" /> Provision (Einbehalten)
                </span>
                <span className="font-medium">-{formatPriceDE(summary.totalCommission)} €</span>
              </div>
              <div className="flex justify-between items-center py-4 text-primary text-xl border-t-2">
                <span className="font-black uppercase tracking-tighter">Auszahlungssumme</span>
                <span className="font-black">{formatPriceDE(summary.totalPayoutSoll)} €</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payout Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              Auszahlungs-Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  Fortschritt ({summary.vendorsPaidCount} von {summary.vendorsTotalCount}{' '}
                  Verkäufern)
                </span>
                <span className="font-bold">{payoutProgress.toFixed(0)}%</span>
              </div>
              <Progress value={payoutProgress} className="h-3" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-200 dark:border-green-800">
                <div className="text-[10px] uppercase font-bold text-green-700 dark:text-green-400">
                  Bereits ausgezahlt
                </div>
                <div className="text-2xl font-black text-green-700 dark:text-green-400">
                  {formatPriceDE(summary.totalPaidOut)} €
                </div>
              </div>
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                <div className="text-[10px] uppercase font-bold text-primary">Noch ausstehend</div>
                <div className="text-2xl font-black text-primary">
                  {formatPriceDE(summary.totalPendingPayout)} €
                </div>
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg flex gap-3 items-start">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground italic">
                Hinweis: Der Kassensturz hilft dir dabei, die physischen Bargeldflüsse zu
                kontrollieren. Der "Noch ausstehend"-Betrag muss am Ende des Events im Idealfall
                genau der Summe der noch nicht abgerechneten Verkäufer entsprechen.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
