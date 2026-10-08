import { CheckCircle2 } from 'lucide-react';
import { AppBar, BikeWithTag, HangTag, PhoneFrame } from './Illustrations';

/**
 * Hero scene: an old bike with a BazarPro hang tag is scanned with an ordinary
 * phone running BazarPro; the item appears and is sold. Decorative (aria-hidden).
 */
export function HeroBikeDemo() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-xl pb-4">
      <div className="absolute inset-x-8 bottom-6 top-10 -z-10 rounded-full bg-primary/15 blur-3xl dark:bg-primary/25" />

      <div className="relative pr-[26%] pt-6">
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

      <PhoneFrame className="absolute bottom-0 right-0 w-[32%] max-w-[9.5rem]">
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
      </PhoneFrame>
    </div>
  );
}
