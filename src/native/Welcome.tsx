import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CalendarPlus,
  Camera,
  Radio,
  ScanLine,
  Server,
  ShoppingBag,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { ApiClient } from '../lib/api/client';
import { api } from '../lib/api/functions';
import { ServerSetup } from './ServerSetup';

/** The cards to swipe through, texts in common.json app.welcome.cards */
const CARDS = [
  { key: 'capture', icon: Camera },
  { key: 'scan', icon: ScanLine },
  { key: 'live', icon: Radio },
  { key: 'organize', icon: CalendarPlus },
  { key: 'payout', icon: Wallet },
  { key: 'selfHost', icon: Server },
] as const satisfies readonly { key: string; icon: LucideIcon }[];

/**
 * Start of the mobile app when signed out: what BazarPro does as cards to swipe
 * through, then sign-in, registration or a self-hosted server. Works without the
 * server, so it also shows when the server cannot be reached; only the demo notice
 * (as above the landing page) and which of sign-in and registration are open come
 * from it.
 */
export function Welcome({ server }: { server: string }) {
  const { t } = useTranslation('common');
  const [choosingServer, setChoosingServer] = useState(false);
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  // Feature flags of the server; until they arrive (or without the server) all buttons
  const [flags, setFlags] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let current = true;
    new ApiClient(server)
      .query(api.featureFlags.get, {})
      .then((value) => current && setFlags(value))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [server]);
  const isDemoMode = flags?.['is_demo_mode'] ?? false;
  const isLoginEnabled = flags?.['is_login_enabled'] ?? true;
  const isRegistrationEnabled = flags?.['is_registration_enabled'] ?? true;

  if (choosingServer) {
    return <ServerSetup initial={server} onCancel={() => setChoosingServer(false)} />;
  }

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  const showCard = (index: number) => {
    const el = track.current;
    el?.scrollTo?.({ left: index * el.clientWidth, behavior: 'smooth' });
    setActive(index);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {isDemoMode && (
        <div className="flex items-center justify-center gap-2 bg-yellow-500 px-4 py-2 text-center text-sm font-medium text-yellow-950">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{t('header.demoMode')}</span>
        </div>
      )}
      <header className="flex flex-col items-center gap-2 px-6 pt-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ShoppingBag className="h-9 w-9" />
        </div>
        <h1 className="text-2xl font-semibold">BazarPro</h1>
        <p className="text-muted-foreground">{t('app.welcome.tagline')}</p>
      </header>

      <section
        aria-roledescription="carousel"
        aria-label={t('app.welcome.features')}
        className="flex flex-1 flex-col justify-center py-6"
      >
        <div
          ref={track}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CARDS.map(({ key, icon: Icon }, index) => (
            <div
              key={key}
              role="group"
              aria-roledescription="slide"
              aria-label={t('app.welcome.slide', { index: index + 1, count: CARDS.length })}
              className="w-full shrink-0 snap-center px-6"
            >
              <div className="flex h-full flex-col items-center gap-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-7 w-7" />
                </div>
                <h2 className="text-lg font-semibold">{t(`app.welcome.cards.${key}.title`)}</h2>
                <p className="text-muted-foreground">{t(`app.welcome.cards.${key}.text`)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {CARDS.map(({ key }, index) => (
            <button
              key={key}
              type="button"
              onClick={() => showCard(index)}
              aria-label={t('app.welcome.slide', { index: index + 1, count: CARDS.length })}
              aria-current={index === active}
              className={`h-2 rounded-full transition-all ${
                index === active ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 px-6 pb-6">
        {isRegistrationEnabled && (
          <Button size="lg" onClick={() => window.location.assign('/register')}>
            {t('app.welcome.register')}
          </Button>
        )}
        {isLoginEnabled && (
          <Button
            size="lg"
            variant={isRegistrationEnabled ? 'outline' : 'default'}
            onClick={() => window.location.assign('/login')}
          >
            {t('app.welcome.login')}
          </Button>
        )}
        <Button variant="ghost" onClick={() => setChoosingServer(true)}>
          {t('app.welcome.ownServer')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t('app.server.current', { server: new URL(server).host })}
        </p>
      </div>
    </div>
  );
}
