import {
  ArrowRight,
  ArrowUpRight,
  Calendar,
  MapPin,
  PlayCircle,
  Search,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFeatureFlags } from '../../../../hooks/useFeatureFlags';
import { DEMO_URL } from '../../../../lib/links';
import { cn } from '../../../../lib/utils';
import { HeroSaleScene } from './demo/HeroSaleScene';
import { useTranslation } from 'react-i18next';

interface LandingHeroProps {
  isAuthenticated: boolean;
  onOrganizerClick: () => void;
  onSellerClick: () => void;
}

export function LandingHero({
  isAuthenticated,
  onOrganizerClick,
  onSellerClick,
}: LandingHeroProps) {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { isDemoMode } = useFeatureFlags();
  return (
    <section className="relative isolate flex items-center overflow-hidden lg:min-h-[min(calc(100svh-4rem),44rem)]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12 lg:py-16">
        <div className="mx-auto min-w-0 max-w-2xl space-y-6 text-center lg:mx-0 lg:text-left">
          {/* "Second-Hand-Basare" does not break: on phones the size follows the width */}
          <h1 className="text-[clamp(1.75rem,8vw,2.25rem)] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            <span className="whitespace-nowrap">{t('hero.titleStart')}</span>
            <br />
            {/* A tag-yellow stroke under the highlighted words: below the letters, so they stay
                readable on the light and the dark ground */}
            <span className="relative isolate inline-block">
              {t('hero.titleHighlight')}
              <span
                aria-hidden="true"
                className="absolute -inset-x-1 -bottom-[0.06em] -z-10 h-[0.2em] -rotate-1 rounded-full bg-tag"
              />
            </span>{' '}
            {t('hero.titleEnd')}
          </h1>

          <p className="mx-auto max-w-xl text-balance text-lg text-muted-foreground sm:text-xl lg:mx-0 lg:leading-relaxed">
            {t('hero.text')}
          </p>

          {/* One way in per intention, so nobody has to guess which button is theirs */}
          <div
            role="group"
            aria-labelledby="landing-intent"
            className="mx-auto max-w-xl space-y-2.5 text-left lg:mx-0"
          >
            <p
              id="landing-intent"
              className="text-center font-display text-sm font-semibold text-muted-foreground lg:text-left"
            >
              {t('intent.ask')}
            </p>
            <IntentCard
              icon={Calendar}
              title={isAuthenticated ? t('actions.myEvents') : t('intent.organize')}
              text={isAuthenticated ? t('intent.organizeSignedIn') : t('intent.organizeText')}
              onClick={onOrganizerClick}
              primary
            />
            {isAuthenticated ? (
              <>
                <IntentCard
                  icon={Tag}
                  title={t('actions.myProducts')}
                  text={t('intent.sellSignedIn')}
                  onClick={onSellerClick}
                />
                <IntentCard
                  icon={Search}
                  title={t('intent.find')}
                  text={t('intent.findText')}
                  onClick={() => navigate('/browse-events')}
                />
              </>
            ) : (
              <>
                <IntentCard
                  icon={MapPin}
                  title={t('intent.nearby')}
                  text={t('intent.nearbyText')}
                  onClick={() => navigate('/bazaars')}
                />
                {/* The demo is its own instance; on it, its accounts wait at the login */}
                <IntentCard
                  icon={PlayCircle}
                  title={t('intent.try')}
                  text={t('intent.tryText')}
                  href={isDemoMode ? undefined : DEMO_URL}
                  onClick={isDemoMode ? () => navigate('/login') : undefined}
                />
              </>
            )}
          </div>
        </div>

        <HeroSaleScene />
      </div>
    </section>
  );
}

/** A way in: what the visitor wants to do, in their words, with one line on what follows. */
function IntentCard({
  icon: Icon,
  title,
  text,
  onClick,
  href,
  primary = false,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  onClick?: () => void;
  /** Another site, opened in a new tab */
  href?: string;
  primary?: boolean;
}) {
  const className = cn(
    'group flex w-full items-center gap-4 rounded-2xl border p-3 pr-4 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    primary
      ? // Dark theme: a petrol tint, a full light block would glare
        'border-primary bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-shade)] hover:bg-primary/90 dark:shadow-none'
      : 'bg-card hover:bg-accent'
  );
  const content = (
    <>
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          primary ? 'bg-primary-foreground/15' : 'bg-primary/10 text-primary'
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold sm:text-[1.0625rem]">{title}</span>
        <span
          className={cn(
            'block text-sm',
            primary ? 'text-primary-foreground/85' : 'text-muted-foreground'
          )}
        >
          {text}
        </span>
      </span>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5',
          primary ? 'bg-tag text-tag-foreground' : 'bg-muted'
        )}
      >
        {href ? <ArrowUpRight className="size-4" /> : <ArrowRight className="size-4" />}
      </span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener" className={className}>
      {content}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
