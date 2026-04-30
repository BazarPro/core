
import { Footer } from '../../../components/layout/Footer';
import { Check } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useNavigate } from 'react-router-dom';

export function PricingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      

      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl font-bold mb-6 text-center">Preise</h1>
            <p className="text-xl text-muted-foreground text-center max-w-2xl mx-auto mb-16">
              Aktuell ist BazarPro vollständig kostenlos nutzbar.
            </p>

            <div className="max-w-3xl mx-auto">
              <div className="border rounded-2xl p-8 md:p-10 shadow-sm bg-card">
                <h3 className="text-2xl font-bold mb-2">Kostenlos</h3>
                <div className="text-4xl font-bold mb-6">
                  0€ <span className="text-base font-normal text-muted-foreground">/ Monat</span>
                </div>
                <p className="text-muted-foreground mb-8">
                  Alle aktuell verfügbaren Funktionen sind ohne Aufpreis enthalten.
                </p>

                <ul className="space-y-4 mb-8">
                  <PriceFeature text="Unbegrenzte Events" />
                  <PriceFeature text="Unbegrenzte Verkäufer" />
                  <PriceFeature text="Produkt- und QR-Code-Verwaltung" />
                  <PriceFeature text="Teilnehmer- und Inventurfunktionen" />
                  <PriceFeature text="Kein Upgrade erforderlich" />
                </ul>

                <Button className="w-full" onClick={() => navigate('/register')}>
                  Kostenlos starten
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function PriceFeature({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-3">
      <Check className="h-5 w-5 text-primary flex-shrink-0" />
      <span>{text}</span>
    </li>
  );
}
