import { CheckCircle2 } from 'lucide-react';
import { AppBar, BikeWithTag, HangTag, PhoneFrame } from './Illustrations';

/**
 * Hero scene: an old bike with a BazarPro hang tag is scanned with an ordinary
 * phone running BazarPro; the item appears and is sold. Decorative (aria-hidden).
 */
export function HeroBikeDemo() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-xl">
      <div className="absolute inset-x-8 bottom-6 top-10 -z-10 rounded-full bg-primary/15 blur-3xl dark:bg-primary/25" />

      <div className="flex items-center gap-3 sm:gap-5">
        <div className="min-w-0 flex-1 pt-4">
          <BikeWithTag
            className="drop-shadow-sm"
            tag={
              <div className="landing-swing origin-top sm:scale-110">
                <HangTag
                  itemNumber="Nr. 12-034"
                  overlay={
                    <span
                      className="landing-scan pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.7)]"
                      style={{ ['--landing-scan-distance' as string]: '2.9rem' }}
                    />
                  }
                />
              </div>
            }
          />
        </div>
        <PhoneFrame className="w-[27%] max-w-[9rem] shrink-0">
          <AppBar title="Kasse" />
          <div className="space-y-2 p-2 pb-3">
            <div className="landing-appear rounded-lg border bg-card p-1.5">
              <p className="truncate text-[0.6rem] text-muted-foreground">Hollandrad 28 Zoll</p>
              <p className="text-sm font-bold tabular-nums">45,00 €</p>
            </div>
            <div className="relative">
              <div className="rounded-lg bg-primary py-1.5 text-center text-[0.65rem] font-bold text-primary-foreground">
                Verkaufen
              </div>
              <div className="landing-toast absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 text-[0.65rem] font-bold text-white">
                <CheckCircle2 className="h-3 w-3" /> Verkauft
              </div>
            </div>
          </div>
          <div className="mt-auto space-y-1 border-t p-2 text-[0.55rem]">
            <p className="font-semibold">Letzte Verkäufe</p>
            {[
              ['Kinderhelm', '8,00 €'],
              ['Fahrradkorb', '6,50 €'],
              ['Laufrad', '25,00 €'],
            ].map(([item, price]) => (
              <div key={item} className="flex justify-between gap-1 text-muted-foreground">
                <span className="truncate">{item}</span>
                <span className="tabular-nums">{price}</span>
              </div>
            ))}
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}
