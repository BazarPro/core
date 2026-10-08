import { Bike, Check, ImagePlus, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { CSSProperties, ReactNode } from 'react';
import { PriceTag } from './PriceTag';

/*
 * Scenes for the "So funktioniert der Verkauf" stepper. They are remounted when
 * their step becomes active, so the one-shot animations replay. All are
 * decorative; the step texts describe what happens.
 */

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

function SceneCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-3xl border bg-card p-5 shadow-xl">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

export function CaptureScene() {
  const fields: [string, string, number][] = [
    ['Titel', 'Kinderfahrrad 20 Zoll', 150],
    ['Preis', '45,00 €', 1050],
    ['Kategorie', 'Fahrräder & Zubehör', 1650],
  ];
  return (
    <SceneCard title="Neuer Artikel">
      <div className="flex gap-4">
        <div className="landing-pop flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
          <Bike className="h-10 w-10" />
        </div>
        <div className="flex flex-1 flex-col justify-center gap-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ImagePlus className="h-3.5 w-3.5" /> Foto hinzugefügt
          </span>
          <span>Zustand: gut erhalten</span>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {fields.map(([label, value, ms]) => (
          <div key={label} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <div className="rounded-lg border bg-background px-3 py-2 text-sm font-medium">
              <span className="landing-type inline-block whitespace-nowrap" style={delay(ms)}>
                {value}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div
        className="landing-fade-up mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
        style={delay(2300)}
      >
        <Check className="h-4 w-4" /> Artikel gespeichert
      </div>
    </SceneCard>
  );
}

export function PrintScene() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center">
      <div className="relative z-10 w-full rounded-3xl border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Printer className="h-5 w-5 text-primary" /> Etiketten.pdf
          </span>
          <span className="text-xs text-muted-foreground">3 Etiketten</span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-muted">
          <div className="landing-grow-x h-full rounded-full bg-primary" />
        </div>
        <div className="mx-auto mt-4 h-2 w-4/5 rounded-full bg-foreground/80" />
      </div>
      <div className="-mt-2 w-[85%] overflow-hidden pb-6">
        <div className="landing-print" style={delay(500)}>
          <PriceTag title="Kinderfahrrad 20 Zoll" price="45,00 €" seller="Verkäufer 12" />
        </div>
      </div>
      <p className="landing-fade-up text-center text-sm text-muted-foreground" style={delay(1700)}>
        Ausdrucken, ausschneiden, an den Artikel kleben.
      </p>
    </div>
  );
}

export function ScanScene() {
  const items: [string, string][] = [
    ['Kinderfahrrad 20 Zoll', '45,00 €'],
    ['Winterjacke Gr. 116', '12,00 €'],
    ['Lego Feuerwehr', '18,50 €'],
  ];
  return (
    <div className="flex w-full max-w-sm items-start justify-center gap-4">
      <div className="w-44 shrink-0 rounded-[2rem] border-4 border-foreground/80 bg-zinc-950 p-2 shadow-2xl sm:w-48">
        <div className="relative overflow-hidden rounded-[1.4rem] bg-zinc-900 px-3 pb-3 pt-7">
          <span className="absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-zinc-700" />
          <p className="mb-3 text-center text-[0.7rem] font-semibold uppercase tracking-wider text-zinc-400">
            Kasse 1
          </p>
          <div className="relative mx-auto w-fit rounded-lg bg-white p-1.5">
            <QRCodeSVG value="https://bazarpro.de" size={96} level="L" marginSize={1} />
            {[
              'left-0 top-0 border-l-4 border-t-4',
              'right-0 top-0 border-r-4 border-t-4',
              'bottom-0 left-0 border-b-4 border-l-4',
              'bottom-0 right-0 border-b-4 border-r-4',
            ].map((corner) => (
              <span
                key={corner}
                className={`absolute h-5 w-5 rounded-sm border-emerald-400 ${corner}`}
              />
            ))}
            <span
              className="landing-scan-loop absolute inset-x-1 top-1.5 h-0.5 bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)]"
              style={{ ['--landing-scan-distance' as string]: '5.75rem' }}
            />
          </div>
          <p className="mt-3 text-center text-[0.7rem] font-medium text-zinc-300">
            QR-Code im Rahmen halten
          </p>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-zinc-800 px-3 py-2 text-[0.7rem] text-zinc-300">
            <span>3 Artikel</span>
            <span className="font-bold tabular-nums text-white">75,50 €</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex-1 space-y-2">
        {items.map(([title, price], index) => (
          <div
            key={title}
            className="landing-fade-up rounded-xl border bg-card p-2.5 text-xs shadow-sm"
            style={delay(600 + index * 700)}
          >
            <p className="truncate font-semibold">{title}</p>
            <p className="mt-1 flex items-center justify-between gap-2">
              <span className="tabular-nums text-muted-foreground">{price}</span>
              <span
                className="landing-pop inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300"
                style={delay(900 + index * 700)}
              >
                <Check className="h-3 w-3" /> verkauft
              </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PayoutScene() {
  const sellers: [string, number, number][] = [
    ['Verkäufer 12', 135, 0.92],
    ['Verkäufer 7', 98, 0.67],
    ['Verkäufer 31', 62.5, 0.43],
  ];
  const format = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;
  return (
    <SceneCard title="Abrechnung · Kinderbasar">
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
        className="landing-fade-up mt-5 flex items-center justify-between rounded-xl bg-muted/70 px-3 py-2.5 text-sm"
        style={delay(1700)}
      >
        <span className="text-muted-foreground">Provision Veranstalter (10 %)</span>
        <span className="font-bold tabular-nums">{format((135 + 98 + 62.5) * 0.1)}</span>
      </div>
    </SceneCard>
  );
}
