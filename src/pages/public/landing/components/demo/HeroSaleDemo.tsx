import { CheckCircle2, ScanLine, Smartphone, Wallet } from 'lucide-react';
import { PriceTag } from './PriceTag';

/**
 * Animated checkout scene for the hero: a label is scanned, stamped as sold
 * and the seller's payout appears. Decorative (aria-hidden); the hero text
 * carries the message.
 */
export function HeroSaleDemo() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[26rem] pb-10 sm:pb-12">
      <div className="absolute inset-6 -z-10 rounded-full bg-primary/25 blur-3xl dark:bg-primary/30" />

      <div className="relative rounded-[1.75rem] border bg-card p-4 shadow-2xl shadow-primary/10 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            Kasse 1 · Kinderbasar
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            <ScanLine className="h-3.5 w-3.5" />
            Scannen
          </span>
        </div>

        <div className="relative rounded-2xl bg-muted/60 p-4 sm:p-5">
          <PriceTag
            title="Kinderfahrrad 20 Zoll"
            price="45,00 €"
            seller="Verkäufer 12"
            qrSize={84}
            qrOverlay={
              <span
                className="landing-scan pointer-events-none absolute inset-x-0 top-1 h-0.5 bg-red-500 shadow-[0_0_10px_2px_rgba(239,68,68,0.7)]"
                style={{ ['--landing-scan-distance' as string]: '4.75rem' }}
              />
            }
          />
          <span className="landing-stamp absolute right-3 top-3 rounded-lg border-2 border-emerald-600 bg-emerald-50 px-2 py-0.5 text-sm font-black uppercase tracking-widest text-emerald-700 shadow-sm dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300 sm:right-4 sm:top-4">
            Verkauft
          </span>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {[
            ['Winterjacke Gr. 116', '12,00 €'],
            ['Lego Feuerwehr', '18,50 €'],
          ].map(([item, price]) => (
            <div key={item} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">{item}</span>
              </span>
              <span className="font-medium tabular-nums">{price}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-2 font-bold">
            <span>Summe</span>
            <span className="tabular-nums">75,50 €</span>
          </div>
        </div>
      </div>

      <div className="landing-toast absolute bottom-0 left-2 right-2 flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-xl sm:-left-8 sm:right-auto sm:w-72">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Auszahlung an Verkäufer 12</p>
          <p className="text-base font-bold tabular-nums">
            +40,50 €{' '}
            <span className="text-xs font-normal text-muted-foreground">(10 % Provision)</span>
          </p>
        </div>
      </div>

      <div className="landing-float absolute -right-2 -top-4 hidden items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold shadow-lg sm:flex">
        <Smartphone className="h-3.5 w-3.5 text-primary" />
        Kasse per Smartphone
      </div>
    </div>
  );
}
