import { ArrowRight, Camera, Check, Printer, RotateCcw, ScanLine } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../../../../lib/utils';
import { BikeIllustration, BikeWithTag, HangTag, PhoneFrame } from './Illustrations';

/*
 * Scenes for "So funktioniert der Verkauf": one old bike from photo to payout.
 * They are remounted when their step becomes active, so the one-shot animations
 * replay. Decorative; the step texts describe what happens. Status names match
 * the app (Angemeldet, Erhältlich, Verkauft, Zurückgegeben).
 */

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

const ITEM = { title: 'Hollandrad 28 Zoll', price: '45,00 €' };

type Tone = 'neutral' | 'primary' | 'success' | 'muted';

function StatusChip({
  tone,
  children,
  className,
  style,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    primary: 'bg-primary/15 text-primary',
    success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    muted: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        tones[tone],
        className
      )}
      style={style}
    >
      {children}
    </span>
  );
}

/** "Photo" backdrop: a bike photographed outside (same colors in both themes). */
function BikePhoto({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-end justify-center bg-gradient-to-b from-sky-200 via-sky-100 to-stone-300 px-2 pb-2 text-zinc-800',
        className
      )}
    >
      <BikeIllustration className="w-full text-zinc-800" />
    </div>
  );
}

export function PhotoScene() {
  return (
    <div className="flex w-full max-w-md items-center gap-4">
      <PhoneFrame className="w-36 shrink-0 sm:w-40">
        <div className="relative pt-5">
          <BikePhoto className="h-44 pt-10" />
          {[
            'left-3 top-8 border-l-2 border-t-2',
            'right-3 top-8 border-r-2 border-t-2',
            'bottom-14 left-3 border-b-2 border-l-2',
            'bottom-14 right-3 border-b-2 border-r-2',
          ].map((corner) => (
            <span key={corner} className={`absolute h-4 w-4 border-white ${corner}`} />
          ))}
          <span
            className="landing-flash pointer-events-none absolute inset-0 bg-white"
            style={delay(700)}
          />
          <div className="flex justify-center py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/80">
              <span className="h-6 w-6 rounded-full bg-white" />
            </span>
          </div>
        </div>
      </PhoneFrame>

      <div
        className="landing-fade-up flex-1 space-y-3 rounded-2xl border bg-card p-3 shadow-xl sm:p-4"
        style={delay(1200)}
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Camera className="h-3.5 w-3.5" /> Neues Inserat
        </p>
        <div className="overflow-hidden rounded-xl">
          <BikePhoto className="px-5 pt-4" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">{ITEM.title}</p>
          <p className="text-lg font-extrabold tabular-nums">{ITEM.price}</p>
          <p className="text-xs text-muted-foreground">Gut erhalten · Fahrradbörse</p>
        </div>
        <StatusChip tone="neutral" className="landing-pop" style={delay(2000)}>
          <Check className="h-3 w-3" /> Angemeldet
        </StatusChip>
      </div>
    </div>
  );
}

export function TagScene() {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Printer className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-semibold">Etikett drucken</p>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="landing-grow-x h-full rounded-full bg-primary" />
          </div>
        </div>
      </div>
      <BikeWithTag
        className="w-[90%]"
        tag={
          <div className="landing-attach origin-top" style={delay(900)}>
            <HangTag price={ITEM.price} />
          </div>
        }
      />
      <p className="landing-fade-up text-center text-sm text-muted-foreground" style={delay(2200)}>
        QR-Code dranhängen – fertig für den Basar.
      </p>
    </div>
  );
}

function ScanningBike({ scanLabel }: { scanLabel: string }) {
  return (
    <div className="relative w-full">
      <div className="pr-[28%]">
        <BikeWithTag
          tag={
            <HangTag
              price={ITEM.price}
              overlay={
                <span
                  className="landing-scan-loop pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]"
                  style={{ ['--landing-scan-distance' as string]: '2.9rem' }}
                />
              }
            />
          }
        />
      </div>
      <PhoneFrame className="absolute bottom-0 right-0 w-[32%]">
        <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-2 pb-3 pt-6 text-white">
          <ScanLine className="h-6 w-6 text-emerald-400" />
          <p className="text-center text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-400">
            {scanLabel}
          </p>
        </div>
      </PhoneFrame>
    </div>
  );
}

export function CheckInScene() {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5">
      <ScanningBike scanLabel="Annahme" />
      <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 shadow-lg">
        <StatusChip tone="muted" className="landing-strike" style={delay(1100)}>
          Angemeldet
        </StatusChip>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <StatusChip tone="primary" className="landing-pop" style={delay(1300)}>
          <Check className="h-3 w-3" /> Erhältlich
        </StatusChip>
      </div>
    </div>
  );
}

export function SellScene() {
  return (
    <div className="grid w-full max-w-md grid-cols-2 items-start gap-4">
      <div className="space-y-2">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Besucher scannt
        </p>
        <PhoneFrame>
          <div className="space-y-2 bg-background p-2 pt-6 text-foreground">
            <div className="landing-fade-up overflow-hidden rounded-lg" style={delay(300)}>
              <BikePhoto className="h-16 px-4 pt-2" />
            </div>
            <div className="landing-fade-up space-y-1 px-1" style={delay(600)}>
              <p className="text-xs font-bold leading-tight">{ITEM.title}</p>
              <p className="text-base font-extrabold tabular-nums">{ITEM.price}</p>
              <StatusChip tone="primary">Erhältlich</StatusChip>
            </div>
          </div>
        </PhoneFrame>
      </div>
      <div className="space-y-2">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Kasse scannt
        </p>
        <div
          className="landing-fade-up space-y-3 rounded-2xl border bg-card p-3 shadow-xl"
          style={delay(1000)}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <ScanLine className="h-3.5 w-3.5 text-primary" /> Kasse 1
          </p>
          <div className="text-sm">
            <p className="font-semibold leading-tight">{ITEM.title}</p>
            <p className="tabular-nums text-muted-foreground">{ITEM.price}</p>
          </div>
          <div
            className="landing-pop flex items-center justify-center gap-1 rounded-xl bg-emerald-500 py-2 text-sm font-bold text-white"
            style={delay(1700)}
          >
            <Check className="h-4 w-4" /> Verkauft
          </div>
          <p className="landing-fade-up text-xs text-muted-foreground" style={delay(2100)}>
            Verkäufer sieht es sofort live.
          </p>
        </div>
      </div>
    </div>
  );
}

export function PayoutScene() {
  const sellers: [string, number, number][] = [
    ['Verkäufer 12', 135, 0.92],
    ['Verkäufer 7', 98, 0.67],
  ];
  const format = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;
  return (
    <div className="w-full max-w-sm rounded-3xl border bg-card p-5 shadow-xl">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Abrechnung · Fahrradbörse
      </p>
      <div className="space-y-4">
        {sellers.map(([name, revenue, share], index) => (
          <div key={name} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">{name}</span>
              <span className="text-xs text-muted-foreground">
                Umsatz <span className="tabular-nums">{format(revenue)}</span>
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted">
              <div
                className="landing-grow-x h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
                style={{ width: `${share * 100}%`, ...delay(index * 250) }}
              />
            </div>
            <p
              className="landing-fade-up text-right text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400"
              style={delay(700 + index * 250)}
            >
              Auszahlung {format(revenue * 0.9)}
            </p>
          </div>
        ))}
      </div>
      <div
        className="landing-fade-up mt-4 flex items-center justify-between rounded-xl bg-muted/70 px-3 py-2.5 text-sm"
        style={delay(1400)}
      >
        <span className="text-muted-foreground">Provision Veranstalter (10 %)</span>
        <span className="font-bold tabular-nums">{format((135 + 98) * 0.1)}</span>
      </div>
      <div
        className="landing-fade-up mt-2 flex items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm"
        style={delay(1900)}
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <RotateCcw className="h-4 w-4" /> 2 Artikel nicht verkauft
        </span>
        <StatusChip tone="muted">Zurückgegeben</StatusChip>
      </div>
    </div>
  );
}
