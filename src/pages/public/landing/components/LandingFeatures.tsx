import {
  BadgePercent,
  Calendar,
  CalendarPlus,
  Camera,
  ClipboardCheck,
  FileText,
  IdCard,
  KeyRound,
  Layers,
  Map as MapIcon,
  PackageCheck,
  Printer,
  Radio,
  ScanLine,
  Search,
  ShoppingBag,
  Smartphone,
  Undo2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';

interface Feature {
  icon: LucideIcon;
  title: string;
  text: string;
}

interface FeatureGroup {
  icon: LucideIcon;
  title: string;
  accent: string;
  iconBox: string;
  features: Feature[];
}

const groups: FeatureGroup[] = [
  {
    icon: ShoppingBag,
    title: 'Für Verkäufer',
    accent: 'text-amber-700 dark:text-amber-300',
    iconBox: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    features: [
      {
        icon: Camera,
        title: 'Artikel mit Fotos',
        text: 'Beschreibung, Zustand und Kategorie dazu.',
      },
      {
        icon: Layers,
        title: 'Mehrere Basare',
        text: 'Einen Artikel bei mehreren Basaren anbieten, auch gesammelt.',
      },
      {
        icon: Printer,
        title: 'QR-Etiketten als PDF',
        text: 'Einzeln oder alle auf einmal drucken.',
      },
      {
        icon: BadgePercent,
        title: 'Rabatte',
        text: 'Preise während des Basars um bis zu 50 % senken – ohne neues Etikett.',
      },
      {
        icon: Radio,
        title: 'Live-Status',
        text: 'Sehen, was angenommen, verkauft oder zurückgegeben ist.',
      },
      {
        icon: IdCard,
        title: 'Digitaler Ausweis',
        text: 'Abgabe und Abholung mit einem Scan.',
      },
      { icon: FileText, title: 'Privatrechnung', text: 'Kaufbeleg für einen Artikel als PDF.' },
    ],
  },
  {
    icon: Calendar,
    title: 'Für Veranstalter',
    accent: 'text-primary',
    iconBox: 'bg-primary/15 text-primary',
    features: [
      {
        icon: CalendarPlus,
        title: 'Basar anlegen',
        text: 'Termin, Ort, Kategorien und Provision in wenigen Minuten.',
      },
      {
        icon: KeyRound,
        title: 'Anmeldung steuern',
        text: 'Teilnehmerlimit, Zugangscode, öffentlich oder privat.',
      },
      {
        icon: MapIcon,
        title: 'Lageplan & Standorte',
        text: 'Bereiche wie „Halle B“ festlegen, damit Besucher Artikel finden.',
      },
      { icon: Users, title: 'Team', text: 'Co-Organisatoren helfen an Annahme und Kasse.' },
      {
        icon: PackageCheck,
        title: 'Warenannahme per Scan',
        text: 'Einzeln oder alle Artikel eines Verkäufers auf einmal.',
      },
      {
        icon: Smartphone,
        title: 'Kasse per Smartphone',
        text: 'Verkaufen und stornieren – keine zusätzliche Hardware.',
      },
      {
        icon: Wallet,
        title: 'Kassenabschluss',
        text: 'Provision und Auszahlung automatisch, Auszahlungen abhaken.',
      },
      {
        icon: Undo2,
        title: 'Rückgabe',
        text: 'Unverkaufte Ware geordnet an die Verkäufer zurückgeben.',
      },
    ],
  },
  {
    icon: Search,
    title: 'Für Besucher',
    accent: 'text-emerald-700 dark:text-emerald-300',
    iconBox: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    features: [
      { icon: Search, title: 'Basare finden', text: 'Öffentliche Basare mit allen Infos.' },
      {
        icon: ClipboardCheck,
        title: 'Angebote vorab ansehen',
        text: 'Artikel mit Fotos und Preisen schon vor dem Basar.',
      },
      {
        icon: ScanLine,
        title: 'Vor Ort scannen',
        text: 'Preis, Rabatt und Standort direkt über den QR-Code.',
      },
    ],
  },
];

export function LandingFeatures() {
  return (
    <section className="bg-muted/30 py-20 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-2xl space-y-4 text-center sm:mb-16">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Alles, was ein Basar braucht
          </h2>
          <p className="text-pretty text-lg text-muted-foreground">
            Von der Anmeldung bis zum Kassenabschluss – für alle, die mitmachen.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title} className="rounded-[2rem] border bg-card p-6 shadow-sm sm:p-7">
              <h3 className={cn('mb-5 flex items-center gap-2 text-lg font-bold', group.accent)}>
                <group.icon className="h-5 w-5" />
                {group.title}
              </h3>
              <ul className="space-y-4">
                {group.features.map((feature) => (
                  <li key={feature.title} className="flex gap-3">
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        group.iconBox
                      )}
                    >
                      <feature.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-semibold leading-snug">{feature.title}</p>
                      <p className="text-sm text-muted-foreground">{feature.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
