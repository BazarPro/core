
import { Footer } from '../../../components/layout/Footer';
import { Calendar, Users, QrCode, BarChart3, ShoppingBag, Shield } from 'lucide-react';

export function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      

      <main className="flex-grow">
        <section className="py-20 bg-muted/50">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl font-bold mb-6 text-center">Features</h1>
            <p className="text-xl text-muted-foreground text-center max-w-2xl mx-auto mb-16">
              Entdecke alle Funktionen, die BazarPro zur perfekten Lösung für deine
              Verkaufsveranstaltung machen.
            </p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <FeatureDetail
                icon={<Calendar className="h-10 w-10" />}
                title="Event-Management"
                description="Erstelle Veranstaltungen in wenigen Minuten. Definiere Zeiträume, Orte und Teilnahmebedingungen. Behalte jederzeit den Überblick über alle wichtigen Kennzahlen."
              />
              <FeatureDetail
                icon={<Users className="h-10 w-10" />}
                title="Teilnehmerverwaltung"
                description="Verwalte Anmeldungen von Verkäufern zentral. Genehmige Teilnehmer, weise Verkaufsnummern zu und kommuniziere direkt über die Plattform."
              />
              <FeatureDetail
                icon={<QrCode className="h-10 w-10" />}
                title="QR-Code System"
                description="Automatische Generierung von Etiketten mit QR-Codes für alle Produkte. Dies ermöglicht ein blitzschnelles Scannen an der Kasse und fehlerfreie Zuordnung der Umsätze."
              />
              <FeatureDetail
                icon={<BarChart3 className="h-10 w-10" />}
                title="Echtzeit-Auswertung"
                description="Verfolge Verkäufe live während der Veranstaltung. Detaillierte Berichte helfen dir bei der Analyse und Optimierung zukünftiger Events."
              />
              <FeatureDetail
                icon={<ShoppingBag className="h-10 w-10" />}
                title="Produktverwaltung"
                description="Verkäufer können ihre Artikel bequem von zu Hause erfassen. Preise festlegen, Beschreibungen hinzufügen und Fotos hochladen – alles digital und übersichtlich."
              />
              <FeatureDetail
                icon={<Shield className="h-10 w-10" />}
                title="Datensicherheit"
                description="Wir legen höchsten Wert auf den Schutz deiner Daten und der deiner Teilnehmer. DSGVO-konforme Verarbeitung und sichere Serverstandorte verstehen sich von selbst."
              />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function FeatureDetail({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-8 rounded-xl border bg-card hover:shadow-lg transition-all">
      <div className="text-primary mb-6">{icon}</div>
      <h3 className="text-2xl font-semibold mb-4">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
