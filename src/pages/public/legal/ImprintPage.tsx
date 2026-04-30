
import { Footer } from '../../../components/layout/Footer';

export function ImprintPage() {
  return (
    <div className="min-h-screen flex flex-col">
      

      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4 max-w-2xl">
            <h1 className="text-3xl font-bold mb-12">Impressum</h1>

            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold mb-4">Angaben gemäß § 5 TMG</h2>
                <p>
                  Ivo Zeitz
                  <br />
                  Syrlinstraße 8<br />
                  89073 Ulm
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">Kontakt</h2>
                <p>
                  Telefon: +49 (0) 7141 9132745
                  <br />
                  E-Mail: kontakt@bazarpro.de
                  <br />
                  Datenschutz &amp; Rechtsfragen: datenschutz@bazarpro.de
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">
                  Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
                </h2>
                <p>
                  Ivo Zeitz
                  <br />
                  Syrlinstraße 8<br />
                  89073 Ulm
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">EU-Streitschlichtung</h2>
                <p>
                  Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS)
                  bereit:
                  <br />
                  <a
                    href="https://ec.europa.eu/consumers/odr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    https://ec.europa.eu/consumers/odr/
                  </a>
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">Verbraucherstreitbeilegung</h2>
                <p>
                  Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor
                  einer Verbraucherschlichtungsstelle teilzunehmen.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
