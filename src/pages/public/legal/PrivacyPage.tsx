
import { Footer } from '../../../components/layout/Footer';

export function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      

      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4 max-w-4xl">
            <h1 className="text-3xl font-bold mb-8">Datenschutzerklärung</h1>
            <p className="text-sm text-muted-foreground mb-10">Stand: 11.03.2026</p>

            <div className="prose prose-slate max-w-none">
              <h2 className="text-xl font-bold mt-8 mb-4">1. Verantwortlicher</h2>
              <p className="mb-4">
                Verantwortlicher im Sinne von Art. 4 Nr. 7 DSGVO ist:
                <br />
                Ivo Zeitz
                <br />
                Syrlinstraße 8
                <br />
                89073 Ulm
                <br />
                E-Mail: kontakt@bazarpro.de
                <br />
                Telefon: +49 (0) 7141 9132745
              </p>
              <p className="mb-4">
                Für Datenschutz- und Rechtsfragen erreichen Sie uns zusätzlich unter:
                <br />
                E-Mail: datenschutz@bazarpro.de
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">
                2. Allgemeine Informationen zur Datenverarbeitung
              </h2>
              <p className="mb-4">
                Wir verarbeiten personenbezogene Daten ausschließlich im Einklang mit der
                Datenschutz-Grundverordnung (DSGVO), dem Bundesdatenschutzgesetz (BDSG) sowie
                sonstigen anwendbaren datenschutzrechtlichen Vorschriften.
              </p>
              <p className="mb-4">
                Personenbezogene Daten sind alle Informationen, die sich auf eine identifizierte
                oder identifizierbare natürliche Person beziehen (z. B. Name, E-Mail-Adresse,
                Nutzungsdaten, IP-Adresse).
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">3. Kategorien verarbeiteter Daten</h2>
              <p className="mb-4">
                Je nach Nutzung verarbeiten wir insbesondere folgende Datenkategorien:
              </p>
              <ul className="mb-4 list-disc pl-6">
                <li>Stammdaten (z. B. Name, E-Mail, ggf. Anschrift, Profilinformationen)</li>
                <li>Authentifizierungsdaten (z. B. Login-Daten, Provider-Informationen)</li>
                <li>Event- und Produktdaten (z. B. Veranstaltungs- und Artikeldaten)</li>
                <li>
                  Nutzungs- und Protokolldaten (z. B. Zugriffszeitpunkte, technische Ereignisse)
                </li>
                <li>Kommunikationsdaten (z. B. Support-Anfragen)</li>
              </ul>

              <h2 className="text-xl font-bold mt-8 mb-4">
                4. Zwecke und Rechtsgrundlagen der Verarbeitung
              </h2>
              <p className="mb-4">
                Wir verarbeiten personenbezogene Daten insbesondere zu folgenden Zwecken und auf
                folgenden Rechtsgrundlagen:
              </p>
              <ul className="mb-4 list-disc pl-6">
                <li>
                  Bereitstellung und Betrieb der Plattform, Accountverwaltung,
                  Sicherheitsfunktionen: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)
                </li>
                <li>
                  Versand von Verifizierungs- und Sicherheits-E-Mails (z. B. Registrierung,
                  Passwort-Reset): Art. 6 Abs. 1 lit. b DSGVO
                </li>
                <li>
                  Einhaltung rechtlicher Verpflichtungen (z. B. Aufbewahrungspflichten): Art. 6 Abs.
                  1 lit. c DSGVO
                </li>
                <li>
                  IT-Sicherheit, Missbrauchs- und Betrugsprävention, Weiterentwicklung: Art. 6 Abs.
                  1 lit. f DSGVO (berechtigtes Interesse)
                </li>
                <li>
                  Soweit erforderlich und freiwillig erteilt: Art. 6 Abs. 1 lit. a DSGVO
                  (Einwilligung)
                </li>
              </ul>

              <h2 className="text-xl font-bold mt-8 mb-4">5. Registrierung und Nutzerkonto</h2>
              <p className="mb-4">
                Bei Erstellung eines Nutzerkontos verarbeiten wir die von Ihnen eingegebenen Daten,
                um das Konto anzulegen und die Nutzung der Plattform zu ermöglichen.
              </p>
              <p className="mb-4">
                Die E-Mail-Adresse wird zur Verifikation des Kontos sowie für sicherheitsrelevante
                Nachrichten (z. B. Passwort-Reset) verwendet.
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">6. Authentifizierung (inkl. OAuth)</h2>
              <p className="mb-4">
                Für die Anmeldung können je nach Konfiguration E-Mail/Passwort sowie externe
                Authentifizierungsanbieter (z. B. Google, GitHub) genutzt werden. Bei der Nutzung
                externer Anbieter erhalten wir die dort freigegebenen Profildaten (z. B.
                E-Mail-Adresse, Name, Profilbild).
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">
                7. Hosting, Infrastruktur und Auftragsverarbeitung
              </h2>
              <p className="mb-4">
                Für die technische Bereitstellung der Plattform nutzen wir Hosting- und
                Infrastrukturdienstleister (z. B. Convex, Hetzner Online GmbH). Mit Dienstleistern,
                die in unserem Auftrag personenbezogene Daten verarbeiten, schließen wir Verträge
                zur Auftragsverarbeitung gemäß Art. 28 DSGVO.
              </p>
              <p className="mb-4">
                Aktuell werden personenbezogene Daten in Deutschland verarbeitet. Eine Verarbeitung
                in Drittländern findet derzeit nicht statt.
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">
                8. E-Mail-Versand (Transaktions-E-Mails)
              </h2>
              <p className="mb-4">
                Für den Versand von Verifizierungs- und Sicherheits-E-Mails verarbeiten wir
                insbesondere E-Mail-Adresse, Versandzeitpunkt und technische Metadaten. Die
                Verarbeitung erfolgt zur Vertragserfüllung und zur Absicherung des Nutzerkontos.
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">
                9. Kalender-Weiterleitung (Google Kalender)
              </h2>
              <p className="mb-4">
                Auf Eventseiten bieten wir eine Weiterleitung zu Google Kalender an. Wenn Sie diese
                Funktion nutzen, wird eine Verbindung zu Google hergestellt. Dabei koennen
                technische Daten wie IP-Adresse, Browserinformationen und Referrer uebermittelt
                werden. Die Nutzung erfolgt freiwillig und auf Grundlage Ihrer Einwilligung durch
                die Aktivierung der Funktion.
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">10. Plausible Analytics</h2>
              <p className="mb-4">
                Wir nutzen auf unserer Website den Analysedienst Plausible Analytics. Anbieter ist
                die Plausible Insights OÜ, Västriku tn 2, 50403 Tartu, Estland.
              </p>
              <p className="mb-4 font-bold">
                Besonderheit: Wir betreiben Plausible Analytics als selbstgehostete Instanz auf
                unserer eigenen Infrastruktur in Deutschland. Dadurch werden die Analysedaten nicht
                an Dritte weitergegeben und verlassen nicht unseren kontrollierten Serverbereich.
              </p>
              <p className="mb-4">
                Plausible Analytics dient der statistischen Auswertung der Besucherzahlen und des
                Nutzungsverhaltens, um unser Angebot kontinuierlich zu verbessern. Dabei werden
                keine Cookies gesetzt und keine personenbezogenen Daten gespeichert. Die
                IP-Adresse wird lediglich in anonymisierter (gehashter) Form kurzzeitig
                verarbeitet, um Unique Visitors zu unterscheiden. Eine Identifizierung einzelner
                Besucher ist nicht möglich. Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs.
                1 lit. f DSGVO (berechtigtes Interesse). Unser berechtigtes Interesse liegt in der
                bedarfsgerechten Gestaltung und Optimierung unserer Webseite.
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">11. Protokolldaten und IT-Sicherheit</h2>
              <p className="mb-4">
                Beim Zugriff auf die Plattform werden aus technischen Gründen Protokolldaten
                verarbeitet (z. B. IP-Adresse, Datum/Uhrzeit, aufgerufene Ressource,
                Browserinformationen). Die Verarbeitung erfolgt zur Gewährleistung von Stabilität,
                Sicherheit und Missbrauchsprävention auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO.
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">12. Speicherdauer und Löschung</h2>
              <p className="mb-4">
                Personenbezogene Daten werden nur so lange gespeichert, wie dies für die jeweiligen
                Zwecke erforderlich ist oder gesetzliche Aufbewahrungspflichten bestehen.
              </p>
              <p className="mb-4">
                Danach werden die Daten gelöscht oder datenschutzkonform anonymisiert, sofern keine
                gesetzlichen Ausnahmetatbestände entgegenstehen.
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">13. Empfänger von Daten</h2>
              <p className="mb-4">
                Zugriff auf personenbezogene Daten erhalten nur Stellen, die diese zur Erfüllung der
                vertraglichen und gesetzlichen Aufgaben benötigen. Eine Weitergabe erfolgt
                insbesondere an:
              </p>
              <ul className="mb-4 list-disc pl-6">
                <li>IT- und Hosting-Dienstleister (Auftragsverarbeiter)</li>
                <li>Versanddienstleister für transaktionale E-Mails</li>
                <li>Behörden und öffentliche Stellen bei gesetzlicher Verpflichtung</li>
              </ul>

              <h2 className="text-xl font-bold mt-8 mb-4">14. Rechte betroffener Personen</h2>
              <p className="mb-4">
                Sie haben nach Maßgabe der gesetzlichen Voraussetzungen insbesondere folgende
                Rechte:
              </p>
              <ul className="mb-4 list-disc pl-6">
                <li>Auskunft über die verarbeiteten personenbezogenen Daten (Art. 15 DSGVO)</li>
                <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
                <li>Löschung (Art. 17 DSGVO)</li>
                <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
                <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
                <li>
                  Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO
                  (Art. 21 DSGVO)
                </li>
                <li>
                  Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft (Art. 7 Abs. 3
                  DSGVO)
                </li>
              </ul>

              <h2 className="text-xl font-bold mt-8 mb-4">
                15. Beschwerderecht bei einer Aufsichtsbehörde
              </h2>
              <p className="mb-4">
                Sie haben das Recht, sich bei einer Datenschutzaufsichtsbehörde zu beschweren,
                insbesondere in dem Mitgliedstaat Ihres gewöhnlichen Aufenthalts, Ihres
                Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes (Art. 77 DSGVO).
              </p>
              <p className="mb-4">
                Zuständige Datenschutzaufsichtsbehörde für den nicht-öffentlichen und öffentlichen
                Bereich in Baden-Württemberg ist:
                <br />
                Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit
                Baden-Württemberg (LfDI).
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">
                16. Pflicht zur Bereitstellung von Daten
              </h2>
              <p className="mb-4">
                Die Bereitstellung bestimmter personenbezogener Daten ist für die Begründung und
                Durchführung des Nutzungsvertrags erforderlich. Ohne diese Daten ist eine Nutzung
                wesentlicher Funktionen der Plattform nicht möglich.
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">
                17. Automatisierte Entscheidungsfindung
              </h2>
              <p className="mb-4">
                Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art.
                22 DSGVO findet derzeit nicht statt.
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4">
                18. Änderungen dieser Datenschutzerklärung
              </h2>
              <p className="mb-4">
                Wir behalten uns vor, diese Datenschutzerklärung mit Wirkung für die Zukunft
                anzupassen, sofern dies aufgrund geänderter Rechtslage, technischer Änderungen oder
                Weiterentwicklung unserer Leistungen erforderlich ist. Es gilt die jeweils auf der
                Plattform veröffentlichte Fassung.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
