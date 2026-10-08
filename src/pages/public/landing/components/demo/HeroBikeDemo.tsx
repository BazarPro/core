import { CheckCircle2, ScanLine } from 'lucide-react';
import { BikeWithTag, HangTag, PhoneFrame } from './Illustrations';

/**
 * Hero scene: an old bike with a BazarPro hang tag is scanned at the bazaar,
 * the phone shows price and then "Verkauft". Decorative (aria-hidden).
 */
export function HeroBikeDemo() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-xl pb-6">
      <div className="absolute inset-x-8 bottom-6 top-10 -z-10 rounded-full bg-primary/15 blur-3xl dark:bg-primary/25" />

      <div className="relative pr-[24%]">
        <BikeWithTag
          className="drop-shadow-sm"
          tag={
            <div className="landing-swing origin-top sm:scale-110">
              <HangTag
                price="45,00 €"
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

      <PhoneFrame className="absolute bottom-0 right-0 w-[34%] max-w-[10rem]">
        <div className="space-y-2 px-2.5 pb-3 pt-6 text-white">
          <p className="flex items-center justify-center gap-1 text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-400">
            <ScanLine className="h-3 w-3" /> Kasse
          </p>
          <div className="landing-appear rounded-xl bg-zinc-800 p-2">
            <p className="truncate text-[0.7rem] text-zinc-300">Hollandrad 28 Zoll</p>
            <p className="text-base font-bold tabular-nums">45,00 €</p>
          </div>
          <div className="landing-toast flex items-center justify-center gap-1 rounded-xl bg-emerald-500 py-1.5 text-[0.7rem] font-bold text-white">
            <CheckCircle2 className="h-3.5 w-3.5" /> Verkauft
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}
