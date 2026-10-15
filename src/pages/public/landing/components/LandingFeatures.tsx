import {
  BadgePercent,
  Calendar,
  CalendarPlus,
  Camera,
  ClipboardCheck,
  FileText,
  HandCoins,
  Handshake,
  IdCard,
  KeyRound,
  Layers,
  Map as MapIcon,
  MessageCircleQuestionMark,
  MessagesSquare,
  PackageCheck,
  Printer,
  Radio,
  Receipt,
  ScanLine,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Undo2,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../../../lib/utils';
import { DOCS_URL } from '../../../../lib/links';
import { Trans, useTranslation } from 'react-i18next';

interface Feature {
  icon: LucideIcon;
  /** Texts: landing.features.<group>.items.<id> */
  id: string;
}

interface FeatureGroup {
  icon: LucideIcon;
  id: 'seller' | 'organizer' | 'visitor';
  accent: string;
  iconBox: string;
  features: Feature[];
}

const groups: FeatureGroup[] = [
  {
    icon: ShoppingBag,
    id: 'seller',
    accent: 'text-amber-700 dark:text-amber-300',
    iconBox: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    features: [
      { icon: Camera, id: 'camera' },
      { icon: Layers, id: 'layers' },
      { icon: Printer, id: 'printer' },
      { icon: BadgePercent, id: 'badgePercent' },
      { icon: Handshake, id: 'handshake' },
      { icon: MessagesSquare, id: 'messagesSquare' },
      { icon: Radio, id: 'radio' },
      { icon: IdCard, id: 'idCard' },
      { icon: FileText, id: 'fileText' },
    ],
  },
  {
    icon: Calendar,
    id: 'organizer',
    accent: 'text-primary',
    iconBox: 'bg-primary/15 text-primary',
    features: [
      { icon: CalendarPlus, id: 'calendarPlus' },
      { icon: SlidersHorizontal, id: 'slidersHorizontal' },
      { icon: KeyRound, id: 'keyRound' },
      { icon: MapIcon, id: 'mapIcon' },
      { icon: Users, id: 'users' },
      { icon: PackageCheck, id: 'packageCheck' },
      { icon: Smartphone, id: 'smartphone' },
      { icon: UserPlus, id: 'userPlus' },
      { icon: Wallet, id: 'wallet' },
      { icon: Undo2, id: 'undo2' },
    ],
  },
  {
    icon: Search,
    id: 'visitor',
    accent: 'text-emerald-700 dark:text-emerald-300',
    iconBox: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    features: [
      { icon: Search, id: 'search' },
      { icon: ClipboardCheck, id: 'clipboardCheck' },
      { icon: ScanLine, id: 'scanLine' },
      { icon: HandCoins, id: 'handCoins' },
      { icon: MessageCircleQuestionMark, id: 'messageCircleQuestionMark' },
      { icon: Receipt, id: 'receipt' },
    ],
  },
];

export function LandingFeatures() {
  const { t } = useTranslation('landing');
  // Below lg only one role is shown at a time; from lg on all three columns
  const [activeGroup, setActiveGroup] = useState(0);

  return (
    <section className="bg-muted/30 py-20 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-2xl space-y-4 text-center sm:mb-16">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t('features.title')}
          </h2>
          <p className="text-pretty text-lg text-muted-foreground">{t('features.subtitle')}</p>
        </div>

        <div
          role="tablist"
          aria-label={t('features.tablist')}
          className="mx-auto mb-6 flex max-w-md rounded-2xl border bg-background p-1.5 shadow-sm lg:hidden"
        >
          {groups.map((group, index) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              id={`features-tab-${index}`}
              aria-selected={index === activeGroup}
              aria-controls={`features-panel-${index}`}
              onClick={() => setActiveGroup(index)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold transition-colors',
                index === activeGroup
                  ? cn('shadow-sm', group.iconBox)
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <group.icon className="h-4 w-4 shrink-0" />
              {t(`features.groups.${group.id}.short`)}
            </button>
          ))}
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
          {groups.map((group, index) => (
            <div
              key={group.id}
              role="tabpanel"
              id={`features-panel-${index}`}
              aria-labelledby={`features-tab-${index}`}
              className={cn(
                'rounded-[2rem] border bg-card p-6 shadow-sm sm:p-7 lg:block',
                index === activeGroup ? 'block' : 'hidden'
              )}
            >
              <h3 className={cn('mb-5 flex items-center gap-2 text-lg font-bold', group.accent)}>
                <group.icon className="h-5 w-5" />
                {t(`features.groups.${group.id}.title`)}
              </h3>
              <ul className="space-y-4">
                {group.features.map((feature) => (
                  <li key={feature.id} className="flex gap-3">
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        group.iconBox
                      )}
                    >
                      <feature.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-semibold leading-snug">
                        {t(`features.groups.${group.id}.items.${feature.id}.title` as never)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t(`features.groups.${group.id}.items.${feature.id}.text` as never)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-muted-foreground">
          <Trans
            i18nKey="features.docs"
            ns="landing"
            components={{
              docs: (
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                />
              ),
            }}
          />
        </p>
      </div>
    </section>
  );
}
