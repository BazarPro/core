import { Bike, ChevronRight, ShoppingBag, Store } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Accounts of the German demo data (backend/src/demo, `seed` without `--locale`), the data
 * of the demo instance and the review apps. All with the password of the seed.
 */
export const DEMO_PASSWORD = '123456';
const ACCOUNTS = [
  { key: 'organizer', email: 'sabine.krause@example.org', icon: Store },
  { key: 'seller', email: 'laura.zimmermann@example.org', icon: ShoppingBag },
  { key: 'bikeMarket', email: 'user1@bazarpro.de', icon: Bike },
] as const;

/** Demo mode: one click fills in a demo account, so visitors need no account of their own. */
export function DemoAccounts({ onPick }: { onPick: (email: string, password: string) => void }) {
  const { t } = useTranslation('auth');
  return (
    <section
      className="mb-4 rounded-lg border border-warning-soft-foreground/30 bg-warning-soft p-3 sm:mb-6"
      data-testid="demo-accounts"
    >
      <h2 className="text-sm font-medium">{t('demo.title')}</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        {t('demo.hint', { password: DEMO_PASSWORD })}
      </p>
      <ul className="space-y-1.5">
        {ACCOUNTS.map(({ key, email, icon: Icon }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onPick(email, DEMO_PASSWORD)}
              className="group flex w-full items-center gap-3 rounded-md border bg-background px-3 py-2 text-left transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-tight">{t(`demo.${key}`)}</span>
                <span className="block truncate text-xs text-muted-foreground">{email}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
