import { Banknote, Check, MapPin, PackageOpen, Printer, ScanLine } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../../../../lib/utils';
import { AppBar, BikeIllustration, BikeWithTag, HangTag, PhoneFrame } from './Illustrations';

/*
 * Scenes for "So funktioniert der Verkauf": one old bike from photo to pickup.
 * They are remounted when their step becomes active, so the one-shot animations
 * replay. Decorative; the step texts describe what happens. Status names match
 * the app (Angemeldet, Erhältlich, Zurückgegeben, Ausbezahlt).
 */

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

const ITEM = { title: 'Hollandrad 28 Zoll', price: '45,00 €', number: 'Nr. 12-034' };

type Tone = 'amber' | 'primary' | 'success' | 'muted';

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
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    primary: 'bg-primary/15 text-primary',
    success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    muted: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold',
        tones[tone],
        className
      )}
      style={style}
    >
      {children}
    </span>
  );
}

/** "Photo" of the bike outside (same colors in both themes). */
function BikePhoto({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-end justify-center bg-gradient-to-b from-sky-200 via-sky-100 to-stone-300 px-2 pb-1.5 text-zinc-800',
        className
      )}
    >
      <BikeIllustration className="w-full text-zinc-800" />
    </div>
  );
}

const PHONE = 'w-40 shrink-0 sm:w-44';

export function PhotoScene() {
  return (
    <div className="flex w-full max-w-md items-center gap-4">
      <PhoneFrame className={PHONE} screenClassName="bg-zinc-900 text-white">
        <div className="relative">
          <BikePhoto className="h-48 pt-12" />
          {[
            'left-3 top-6 border-l-2 border-t-2',
            'right-3 top-6 border-r-2 border-t-2',
            'bottom-3 left-3 border-b-2 border-l-2',
            'bottom-3 right-3 border-b-2 border-r-2',
          ].map((corner) => (
            <span key={corner} className={`absolute h-4 w-4 border-white ${corner}`} />
          ))}
          <span
            className="landing-flash pointer-events-none absolute inset-0 bg-white"
            style={delay(700)}
          />
        </div>
        <div className="flex justify-center py-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/80">
            <span className="h-6 w-6 rounded-full bg-white" />
          </span>
        </div>
      </PhoneFrame>

      <div
        className="landing-fade-up min-w-0 flex-1 space-y-2.5 rounded-2xl border bg-card p-3 shadow-xl"
        style={delay(1200)}
      >
        <div className="overflow-hidden rounded-xl">
          <BikePhoto className="px-5 pt-3" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">{ITEM.title}</p>
          <p className="text-lg font-extrabold tabular-nums">{ITEM.price}</p>
          <p className="text-xs text-muted-foreground">Gut erhalten · Fahrradbörse</p>
        </div>
        <StatusChip tone="amber" className="landing-pop" style={delay(2000)}>
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
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <Printer className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-semibold">Etiketten.pdf drucken</p>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="landing-grow-x h-full rounded-full bg-amber-500" />
          </div>
        </div>
      </div>
      <BikeWithTag
        className="w-[90%]"
        tag={
          <div className="landing-attach origin-top" style={delay(900)}>
            <HangTag itemNumber={ITEM.number} />
          </div>
        }
      />
      <p className="landing-fade-up text-center text-sm text-muted-foreground" style={delay(2200)}>
        Ohne Preis auf dem Etikett – Rabatte gehen jederzeit.
      </p>
    </div>
  );
}

export function CheckInScene() {
  return (
    <div className="relative w-full max-w-md">
      <div className="pr-[34%] pt-4">
        <BikeWithTag
          tag={
            <HangTag
              itemNumber={ITEM.number}
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
      <PhoneFrame className="absolute right-0 top-0 w-[36%]" screenClassName="min-h-[12.5rem]">
        <AppBar title="Warenannahme" />
        <div className="space-y-2 p-2 pb-3">
          <p className="truncate text-[0.6rem] font-semibold">{ITEM.title}</p>
          <p className="text-[0.55rem] text-muted-foreground">Verkäufer 12</p>
          <div className="flex flex-col items-start gap-1">
            <StatusChip tone="muted" className="landing-strike" style={delay(1100)}>
              Angemeldet
            </StatusChip>
            <StatusChip tone="primary" className="landing-pop" style={delay(1300)}>
              <Check className="h-3 w-3" /> Erhältlich
            </StatusChip>
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}

export function SellScene() {
  return (
    <div className="grid w-full max-w-md grid-cols-2 items-start gap-4">
      <div className="space-y-2">
        <p className="text-center text-xs font-semibold text-muted-foreground">Besucher scannt</p>
        <PhoneFrame screenClassName="min-h-[16rem]">
          <AppBar title="Artikel" />
          <div className="space-y-1.5 p-2 pb-3">
            <div className="landing-fade-up overflow-hidden rounded-lg" style={delay(300)}>
              <BikePhoto className="px-4 pt-2" />
            </div>
            <div className="landing-fade-up space-y-1" style={delay(600)}>
              <p className="text-[0.65rem] font-bold leading-tight">{ITEM.title}</p>
              <p className="text-base font-extrabold tabular-nums">{ITEM.price}</p>
              <p className="flex items-center gap-1 text-[0.6rem] text-muted-foreground">
                <MapPin className="h-3 w-3" /> Halle B · Fahrräder
              </p>
            </div>
          </div>
        </PhoneFrame>
      </div>
      <div className="space-y-2">
        <p className="text-center text-xs font-semibold text-muted-foreground">Kasse scannt</p>
        <div className="landing-fade-up" style={delay(1100)}>
          <PhoneFrame screenClassName="min-h-[16rem]">
            <AppBar title="Kasse" />
            <div className="space-y-2 p-2 pb-3">
              <div className="rounded-lg border bg-card p-1.5">
                <p className="truncate text-[0.6rem] text-muted-foreground">{ITEM.title}</p>
                <p className="text-sm font-bold tabular-nums">{ITEM.price}</p>
              </div>
              <div
                className="landing-tap rounded-lg bg-primary py-1.5 text-center text-[0.65rem] font-bold text-primary-foreground"
                style={delay(1900)}
              >
                Verkaufen
              </div>
              <p
                className="landing-fade-up flex items-center gap-1 text-[0.6rem] text-emerald-700 dark:text-emerald-400"
                style={delay(2300)}
              >
                <Check className="h-3 w-3 shrink-0" /> Gebucht – Verkäufer sieht es live
              </p>
            </div>
          </PhoneFrame>
        </div>
      </div>
    </div>
  );
}

export function SettlementScene() {
  const sellers: [string, number, number][] = [
    ['Verkäufer 12', 135, 0.92],
    ['Verkäufer 7', 98, 0.67],
  ];
  const format = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;
  return (
    <div className="w-full max-w-sm rounded-3xl border bg-card p-5 shadow-xl">
      <p className="mb-4 text-sm font-semibold">Kassenabschluss · Fahrradbörse</p>
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
        <span className="text-muted-foreground">Provision (10 %)</span>
        <span className="font-bold tabular-nums">{format((135 + 98) * 0.1)}</span>
      </div>
    </div>
  );
}

export function PickupScene() {
  return (
    <div className="flex w-full max-w-md items-center gap-4">
      <PhoneFrame className={PHONE}>
        <AppBar title="Meine Abrechnung" />
        <div className="space-y-2 p-2.5 pb-3">
          <div className="landing-fade-up rounded-lg border bg-card p-2" style={delay(200)}>
            <p className="text-[0.6rem] text-muted-foreground">Auszahlung · 3 verkauft</p>
            <p className="text-base font-extrabold tabular-nums">121,50 €</p>
          </div>
          <div className="landing-fade-up rounded-lg border bg-card p-2" style={delay(500)}>
            <p className="text-[0.6rem] text-muted-foreground">Nicht verkauft</p>
            <p className="text-[0.7rem] font-semibold">1 Artikel zum Abholen</p>
          </div>
          <div
            className="landing-fade-up flex flex-col items-center gap-1 rounded-lg bg-white p-2 text-zinc-900"
            style={delay(800)}
          >
            <QRCodeSVG value="https://bazarpro.de" size={52} level="L" marginSize={0} />
            <p className="text-[0.55rem] font-semibold">Digitaler Ausweis</p>
          </div>
        </div>
      </PhoneFrame>
      <div className="min-w-0 flex-1 space-y-3">
        <div
          className="landing-fade-up flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg"
          style={delay(1300)}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            <Banknote className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">Geld abholen</p>
            <StatusChip tone="success" className="landing-pop" style={delay(1700)}>
              <Check className="h-3 w-3" /> Ausbezahlt
            </StatusChip>
          </div>
        </div>
        <div
          className="landing-fade-up flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg"
          style={delay(1900)}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <PackageOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">Ware abholen</p>
            <StatusChip tone="muted" className="landing-pop" style={delay(2300)}>
              Zurückgegeben
            </StatusChip>
          </div>
        </div>
        <p
          className="landing-fade-up flex items-start gap-1.5 text-xs text-muted-foreground"
          style={delay(2600)}
        >
          <ScanLine className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Ein Scan des Ausweises zeigt alle
          eigenen Artikel.
        </p>
      </div>
    </div>
  );
}
