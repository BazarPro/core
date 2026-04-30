import { Calendar, Users, QrCode, BarChart3, Shield, Printer } from 'lucide-react';

const features = [
  {
    icon: Calendar,
    title: 'Event-Management',
    description:
      'Erstelle und verwalte Veranstaltungen mit allen wichtigen Details, Terminen und Einstellungen an einem Ort.',
    color: 'bg-blue-500/10 text-blue-600',
  },
  {
    icon: Users,
    title: 'Teilnehmerverwaltung',
    description:
      'Verwalte Verkäufer und co-Organisatoren einfach. Kontrolliere Zugänge und behalte den Überblick über alle Beteiligten.',
    color: 'bg-purple-500/10 text-purple-600',
  },
  {
    icon: QrCode,
    title: 'Digitales Scannen',
    description:
      'Nutze die integrierte Scan-Funktion für Check-ins und Verkäufe. Keine zusätzliche Hardware erforderlich.',
    color: 'bg-orange-500/10 text-orange-600',
  },
  {
    icon: Printer,
    title: 'QR-Code Etiketten',
    description:
      'Generiere automatisch PDF-Etiketten mit QR-Codes für alle Produkte. Einfach drucken und aufkleben.',
    color: 'bg-green-500/10 text-green-600',
  },
  {
    icon: BarChart3,
    title: 'Live-Abrechnung',
    description:
      'Verfolge Umsätze in Echtzeit. Automatische Berechnung von Provisionen und Auszahlungsbeträgen nach dem Event.',
    color: 'bg-pink-500/10 text-pink-600',
  },
  {
    icon: Shield,
    title: 'Sicher & Transparent',
    description:
      'Deine Daten gehören dir. Als Open-Source-Plattform setzen wir auf volle Transparenz und höchste Sicherheitsstandards.',
    color: 'bg-cyan-500/10 text-cyan-600',
  },
];

export function LandingFeaturesSection() {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-20 space-y-4">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            Alles für dein perfektes Event
          </h2>
          <p className="text-xl text-muted-foreground">
            BazarPro bietet eine vollständige Toolbox für moderne Basare und Flohmärkte.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group p-8 rounded-3xl border bg-card hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 flex flex-col space-y-4"
            >
              <div
                className={`w-12 h-12 rounded-2xl ${feature.color} flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
              >
                <feature.icon className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
