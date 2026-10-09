import { CheckCircle2, Github, GraduationCap, Heart, Linkedin, Server } from 'lucide-react';
import { useMemo } from 'react';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { Button } from '../../../components/ui/button';
import { GITHUB_URL, SELFHOST_URL } from '../../../lib/links';
import { organization, softwareApplication } from '../../../lib/structuredData';
import { LandingCTA } from '../landing/components/LandingCTA';
import { MarketingHero, SectionHeading } from './components/MarketingHero';
import { useStartActions } from './components/useStartActions';

const TEAM = ['Henning von Besser', 'Johannes Staudenraus', 'Ivo Zeitz'];

const MILESTONES = [
  {
    label: 'Wintersemester 2025/26',
    title: 'Studienprojekt an der Universität Ulm',
    text: 'Im Anwendungsprojekt Software Engineering entsteht BazarPro – von der Idee über die Architektur bis zum automatisierten Deployment.',
  },
  {
    label: 'Projektabschluss',
    title: 'BazarPro ist fertig',
    text: 'Alle Funktionen vom Inserat bis zur Abrechnung sind umgesetzt und getestet. BazarPro läuft produktiv unter bazarpro.de.',
  },
  {
    label: 'Heute',
    title: 'Weiterentwicklung als Open Source',
    text: 'Der Code steht unter MIT-Lizenz auf GitHub. Fehlerbehebungen und neue Ideen kommen aus der Community – jede und jeder kann mitmachen.',
  },
];

const STACK = ['React', 'TypeScript', 'Convex', 'Docker', 'GitHub Actions', 'Playwright'];

export function AboutPage() {
  const { isAuthenticated, goToOrganizer, goToSeller } = useStartActions();
  const jsonLd = useMemo(() => [organization(), softwareApplication()], []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background">
      <Seo
        title="Über BazarPro – Open-Source-Software für Basare und Flohmärkte"
        description="BazarPro entstand als Studienprojekt an der Universität Ulm, ist fertig und wird als Open Source (MIT) weiterentwickelt. Kostenlos nutzbar oder selbst hostbar."
        canonical="/about"
        jsonLd={jsonLd}
      />

      <main className="flex-grow">
        <MarketingHero
          eyebrow="Über BazarPro"
          title={
            <>
              Aus einem Uniprojekt wurde <span className="text-primary">fertige Software</span>
            </>
          }
          actions={
            <>
              <Button asChild size="lg" className="h-12 px-6 text-base font-semibold">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  <Github className="mr-2 h-5 w-5" />
                  Code auf GitHub
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-6 text-base font-semibold"
              >
                <a href={SELFHOST_URL} target="_blank" rel="noopener noreferrer">
                  <Server className="mr-2 h-5 w-5" />
                  Selbst hosten
                </a>
              </Button>
            </>
          }
        >
          BazarPro entstand als Studienprojekt an der Universität Ulm. Das Projekt ist
          abgeschlossen, die Software ist fertig – und wird jetzt als Open Source weiterentwickelt.
        </MarketingHero>

        {/* Status */}
        <section className="pb-20 sm:pb-24">
          <div className="container mx-auto grid max-w-5xl gap-4 px-4 sm:grid-cols-3">
            <StatusCard
              icon={CheckCircle2}
              title="Fertig und im Einsatz"
              text="Inserieren, Etiketten, Warenannahme, Kasse und Abrechnung – alles ist umgesetzt."
            />
            <StatusCard
              icon={Heart}
              title="Kostenlos"
              text="Für Veranstalter, Verkäufer und Besucher. Ohne Abo, ohne Provision für BazarPro."
            />
            <StatusCard
              icon={Github}
              title="Open Source (MIT)"
              text="Offener Code, den jeder prüfen, verbessern und selbst betreiben kann."
            />
          </div>
        </section>

        {/* Timeline */}
        <section className="bg-muted/40 py-20 sm:py-24">
          <div className="container mx-auto px-4">
            <SectionHeading eyebrow="Die Geschichte" title="Vom Hörsaal zum Basar" />
            <ol className="mx-auto max-w-3xl space-y-0">
              {MILESTONES.map((milestone, index) => (
                <li key={milestone.title} className="relative flex gap-5 pb-10 last:pb-0">
                  {index < MILESTONES.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[1.15rem] top-10 h-[calc(100%-2.5rem)] w-px bg-border"
                    />
                  )}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="space-y-1.5 pt-1">
                    <p className="text-sm font-semibold uppercase tracking-wider text-primary">
                      {milestone.label}
                    </p>
                    <h3 className="text-xl font-bold">{milestone.title}</h3>
                    <p className="text-pretty leading-relaxed text-muted-foreground">
                      {milestone.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Team */}
        <section className="py-20 sm:py-24">
          <div className="container mx-auto px-4">
            <SectionHeading eyebrow="Das Team" title="Die Köpfe hinter BazarPro">
              Entwickelt im Anwendungsprojekt Software Engineering der Universität Ulm.
            </SectionHeading>

            <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
              {TEAM.map((name) => (
                <div
                  key={name}
                  className="flex flex-col items-center rounded-[1.5rem] border bg-card p-6 text-center shadow-sm"
                >
                  <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                    {initials(name)}
                  </span>
                  <h3 className="font-bold">{name}</h3>
                  <p className="text-sm text-muted-foreground">Software Engineer</p>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-6 flex max-w-4xl flex-col items-center gap-4 rounded-[1.5rem] border bg-card p-6 text-center shadow-sm sm:flex-row sm:text-left">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="h-6 w-6" />
              </span>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Betreut von</p>
                <p className="font-bold">Sven Patrick Meier & Kevin Michelfelder</p>
                <p className="text-sm text-muted-foreground">
                  SK Tech GmbH ·{' '}
                  <a
                    href="https://neuronity.de/de"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:text-primary hover:underline"
                  >
                    Neuronity
                  </a>
                </p>
              </div>
              <a
                href="https://www.linkedin.com/company/neuronity-by-sk-tech/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-primary"
                title="NEURONITY by SK Tech auf LinkedIn"
              >
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>
        </section>

        {/* Contribute */}
        <section className="bg-muted/40 py-20 sm:py-24">
          <div className="container mx-auto px-4">
            <SectionHeading eyebrow="Mitmachen" title="BazarPro gehört allen">
              Du hast einen Fehler gefunden, eine Idee oder willst selbst Code beitragen? Auf GitHub
              kannst du Issues anlegen und Pull Requests einreichen.
            </SectionHeading>
            <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
              {STACK.map((tech) => (
                <span
                  key={tech}
                  className="rounded-full border bg-card px-4 py-1.5 text-sm font-medium shadow-sm"
                >
                  {tech}
                </span>
              ))}
            </div>
            <div className="mt-10 flex justify-center">
              <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer">
                  <Github className="mr-2 h-5 w-5" />
                  Issues auf GitHub
                </a>
              </Button>
            </div>
          </div>
        </section>

        <LandingCTA
          isAuthenticated={isAuthenticated}
          onOrganizerClick={goToOrganizer}
          onSellerClick={goToSeller}
        />
      </main>

      <Footer />
    </div>
  );
}

function initials(name: string) {
  const parts = name.split(' ');
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

function StatusCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Heart;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[1.5rem] border bg-card p-6 shadow-sm">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="mb-1.5 text-lg font-bold">{title}</h2>
      <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
