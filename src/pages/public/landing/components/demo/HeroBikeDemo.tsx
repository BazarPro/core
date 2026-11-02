import { CheckCircle2 } from 'lucide-react';
import { AppBar, BikePhoto, BikeWithTag, HangTag, PhoneFrame } from './Illustrations';
import { useTranslation } from 'react-i18next';

/**
 * Hero scene: an old bike with a BazarPro hang tag is scanned with an ordinary
 * phone running BazarPro; the item appears and is sold. Decorative (aria-hidden).
 */
export function HeroBikeDemo() {
  const { t } = useTranslation('landing');
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-2xl">
      <div className="absolute inset-x-8 bottom-6 top-10 -z-10 rounded-full bg-primary/15 blur-3xl dark:bg-primary/25" />

      <div className="flex items-center gap-3 sm:gap-5">
        <div className="min-w-0 flex-1 pt-4">
          <BikeWithTag
            className="drop-shadow-sm"
            tag={
              <div className="landing-swing origin-top sm:scale-110">
                <HangTag
                  itemNumber={t('demo.itemNumber', { number: '12-034' })}
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
        <PhoneFrame short className="w-[40%] max-w-[10.5rem] shrink-0 sm:w-[28%]">
          <AppBar title={t('demo.checkout')} />
          <div className="space-y-2 p-2 pb-3">
            <div className="landing-appear overflow-hidden rounded-lg">
              <BikePhoto className="px-3 pt-2" />
            </div>
            <div className="landing-appear rounded-lg border bg-card p-1.5">
              <p className="truncate text-[0.6rem] text-muted-foreground">{t('demo.bike')}</p>
              <p className="text-sm font-bold tabular-nums">45,00 €</p>
            </div>
            <div className="relative">
              <div className="rounded-lg bg-primary py-1.5 text-center text-[0.65rem] font-bold text-primary-foreground">
                {t('demo.sell')}
              </div>
              <div className="landing-toast absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 text-[0.65rem] font-bold text-white">
                <CheckCircle2 className="h-3 w-3" /> {t('demo.sold')}
              </div>
            </div>
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}
