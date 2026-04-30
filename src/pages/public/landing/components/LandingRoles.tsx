import {
  Calendar,
  ShoppingBag,
  Users,
  Zap,
  Shield,
  BarChart3,
  ArrowRight,
  Search,
} from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { useNavigate } from 'react-router-dom';

const organizerSteps = [
  {
    title: 'Event erstellen',
    description: 'Lege deine Veranstaltung mit allen Details, Kategorien und Provisionen an.',
  },
  {
    title: 'Verkäufer verwalten',
    description:
      'Behalte den Überblick über Anmeldungen und schalte Verkäufer für dein Event frei.',
  },
  {
    title: 'Check-in & Verkauf',
    description: 'Scanne QR-Codes bei der Warenannahme und erfasse Verkäufe blitzschnell per App.',
  },
  {
    title: 'Digitale Abrechnung',
    description: 'Erstelle automatische Abrechnungen und Auszahlungslisten auf Knopfdruck.',
  },
];

const sellerSteps = [
  {
    title: 'Events entdecken',
    description: 'Finde spannende Basare in deiner Nähe und melde dich als Verkäufer an.',
  },
  {
    title: 'Produkte erfassen',
    description: 'Erfasse deine Artikel mit Preis und Beschreibung bequem von zu Hause aus.',
  },
  {
    title: 'Etiketten drucken',
    description: 'Drucke die generierten QR-Code Etiketten aus und bringe sie an deiner Ware an.',
  },
  {
    title: 'Live-Verkäufe',
    description: 'Verfolge in Echtzeit, welche deiner Produkte bereits verkauft wurden.',
  },
];

interface LandingRolesProps {
  activeRole: 'organizer' | 'seller';
  onRoleChange: (role: 'organizer' | 'seller') => void;
}

export function LandingRoles({ activeRole, onRoleChange }: LandingRolesProps) {
  const navigate = useNavigate();
  const steps = activeRole === 'organizer' ? organizerSteps : sellerSteps;

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Wähle deine Ansicht</h2>
            <p className="text-muted-foreground text-lg">
              BazarPro bietet für jede Rolle maßgeschneiderte Funktionen. Wechsel hier zwischen den
              Ansichten, um zu sehen, was wir für dich tun können.
            </p>
          </div>

          {/* Role Switcher */}
          <div className="p-1.5 bg-background border rounded-2xl inline-flex w-full max-w-md shadow-sm">
            <button
              onClick={() => onRoleChange('seller')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-base font-bold transition-all ${
                activeRole === 'seller'
                  ? 'bg-primary text-primary-foreground shadow-lg scale-[1.02]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <ShoppingBag className="w-5 h-5" />
              Verkäufer
            </button>
            <button
              onClick={() => onRoleChange('organizer')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-base font-bold transition-all ${
                activeRole === 'organizer'
                  ? 'bg-primary text-primary-foreground shadow-lg scale-[1.02]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Calendar className="w-5 h-5" />
              Veranstalter
            </button>
          </div>
        </div>

        <div className="space-y-20 w-full max-w-4xl mx-auto">
          {/* Integrated Steps (Timeline) - Directly under Switcher */}
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center space-y-2">
              <h4 className="text-2xl font-bold">So einfach funktioniert's</h4>
              <p className="text-muted-foreground">In vier Schritten zum Erfolg</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
              {steps.map((step, index) => (
                <div key={index} className="relative space-y-4 group">
                  <div className="flex items-center">
                    <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl shadow-lg group-hover:scale-110 transition-transform z-10">
                      {index + 1}
                    </div>
                    {index < steps.length - 1 && (
                      <div className="hidden lg:block absolute left-12 right-[-1rem] top-6 h-[2px] bg-primary/20 -z-0" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <h5 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
                      {step.title}
                    </h5>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Role Details Card */}
          <div className="bg-card rounded-[2.5rem] border p-8 md:p-12 shadow-sm flex flex-col space-y-8 animate-in fade-in slide-in-from-bottom-12 duration-700">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 shadow-inner">
                {activeRole === 'organizer' ? (
                  <Calendar className="w-9 h-9" />
                ) : (
                  <ShoppingBag className="w-9 h-9" />
                )}
              </div>
              <div className="space-y-1 text-center md:text-left">
                <h3 className="text-3xl font-bold">
                  {activeRole === 'organizer'
                    ? 'Alles für deine Organisation'
                    : 'Dein stressfreier Verkauf'}
                </h3>
                <p className="text-primary font-semibold text-lg">
                  {activeRole === 'organizer'
                    ? 'Vom ersten Plan bis zum Kassensturz'
                    : 'Mehr Zeit für das, was wirklich zählt'}
                </p>
              </div>
            </div>

            <p className="text-muted-foreground text-xl leading-relaxed">
              {activeRole === 'organizer'
                ? 'BazarPro nimmt dir die schwere Arbeit ab. Plane deinen Basar mit automatisierter Verkäuferverwaltung, integriertem Kassen-System und sekundenschneller Abrechnung.'
                : 'Keine handschriftlichen Etiketten mehr. Erfasse deine Produkte online, drucke deine QR-Codes aus und verfolge deine Verkäufe live auf deinem Smartphone.'}
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {(activeRole === 'organizer'
                ? [
                    { icon: Zap, label: 'Digitale Registrierung' },
                    { icon: BarChart3, label: 'Live-Umsatzübersicht' },
                    { icon: Users, label: 'Team-Management' },
                    { icon: Shield, label: 'Rechtssichere Abrechnung' },
                  ]
                : [
                    { icon: Zap, label: 'Schnelle Produkterfassung' },
                    { icon: Shield, label: 'Wiederverwendbare QR-Etiketten' },
                    { icon: BarChart3, label: 'Echtzeit-Statistiken' },
                    { icon: Search, label: 'Einfache Event-Suche' },
                  ]
              ).map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 text-sm font-bold p-4 rounded-2xl bg-muted/50 border border-border/50 transition-all hover:bg-background hover:shadow-sm"
                >
                  <item.icon className="w-5 h-5 text-primary" />
                  {item.label}
                </div>
              ))}
            </div>

            <Button
              className="w-full h-16 text-xl rounded-2xl font-bold group shadow-xl shadow-primary/20"
              variant="default"
              onClick={() =>
                navigate(
                  activeRole === 'organizer'
                    ? '/register?role=organizer'
                    : '/register?role=participant'
                )
              }
            >
              {activeRole === 'organizer'
                ? 'Jetzt als Veranstalter starten'
                : 'Als Verkäufer registrieren'}
              <ArrowRight className="ml-2 w-6 h-6 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
