
import { Footer } from '../../../components/layout/Footer';
import aboutImage from '../../../assets/landing-page-hero.jpg'; // Using existing image for now
import { ImageWithFallback } from '../../../components/ui/image-with-fallback';
import { GraduationCap, Code2, Rocket, Users, User, Linkedin } from 'lucide-react';

export function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="py-20 lg:py-32">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary mb-6">
                  <GraduationCap className="h-4 w-4" />
                  <span className="text-sm font-medium">Studentenprojekt WS 2025/26</span>
                </div>
                <h1 className="text-4xl lg:text-5xl font-bold mb-6">
                  Build your own SaaS - and automate it!
                </h1>
                <div className="text-lg text-muted-foreground space-y-6">
                  <p>
                    BazarPro ist das Ergebnis eines intensiven Software-Engineering-Projekts,
                    welches von einem Studententeam der <strong>Universität Ulm</strong> im Rahmen
                    der Veranstaltung <strong>(Anwendungs-)Projekte SE</strong> des Wintersemesters
                    2025/26 entwickelt wird.
                  </p>
                  <p>
                    Betreut wird das Projekt durch die{' '}
                    <a
                      href="https://www.linkedin.com/company/neuronity-by-sk-tech/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-foreground hover:text-primary transition-colors"
                    >
                      SK Tech GmbH
                    </a>
                    . Mit unserem Produkt <strong>BazarPro</strong> war es unser Ziel, unter
                    realitätsnahen Bedingungen ein marktfähiges SaaS-Produkt zu entwickeln. Dabei
                    standen nicht nur die funktionalen Anforderungen im Fokus, sondern der gesamte
                    Entwicklungsprozess: von der ersten Idee über die Architektur bis hin zum
                    automatisierten Deployment.
                  </p>
                  <p>
                    Wir verbinden technisches Know-how mit unternehmerischem Denken, um moderne
                    Lösungen für echte Probleme zu schaffen.
                  </p>
                </div>
              </div>
              <div className="relative">
                <div className="aspect-square rounded-2xl overflow-hidden shadow-2xl">
                  <ImageWithFallback
                    src={aboutImage}
                    alt="Studentenprojekt Team"
                    className="w-full h-full object-cover"
                  />
                  {/* Overlay badge */}
                  <div className="absolute bottom-6 left-6 right-6 bg-background/90 backdrop-blur-sm p-4 rounded-xl border shadow-lg">
                    <p className="text-sm font-medium mb-1">Betreut durch</p>
                    <p className="text-lg font-bold">Sven Patrick Meier & Kevin Michelfelder</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-sm text-muted-foreground">SK Tech GmbH</p>
                      <span className="text-muted-foreground/30">|</span>
                      <a
                        href="https://neuronity.de/de"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:text-primary transition-colors"
                      >
                        Neuronity
                      </a>
                      <span className="text-muted-foreground/30">|</span>
                      <a
                        href="https://www.linkedin.com/company/neuronity-by-sk-tech/?originalSubdomain=de"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="NEURONITY by SK Tech auf LinkedIn"
                      >
                        <Linkedin className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Team Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold mb-4">Das Team hinter BazarPro</h2>
              <p className="text-xl text-muted-foreground">
                Die Köpfe hinter der Entwicklung von BazarPro
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <TeamMember name="Henning von Besser" role="Software Engineer" />
              <TeamMember name="Johannes Staudenraus" role="Software Engineer" />
              <TeamMember name="Ivo Zeitz" role="Software Engineer" />
            </div>
          </div>
        </section>

        {/* Project Details Section */}
        <section className="py-20 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold mb-4">Das Projekt</h2>
              <p className="text-xl text-muted-foreground">
                Praxisnahe Einblicke in industrielle Softwareentwicklung
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
              <ProjectDetailCard
                icon={<Code2 className="h-8 w-8" />}
                title="Moderne Technologien"
                description="Einsatz von BaaS (Convex), React und TypeScript für eine skalierbare und wartbare Architektur."
              />
              <ProjectDetailCard
                icon={<Rocket className="h-8 w-8" />}
                title="CI/CD & Automatisierung"
                description="Fokus auf professionelle Build- und Release-Prozesse, Containerisierung und Testing-Strategien."
              />
              <ProjectDetailCard
                icon={<Users className="h-8 w-8" />}
                title="Agile Teamarbeit"
                description="Gemeinsame Konzeption und Entwicklung im Team nach modernen, kollaborativen Methoden."
              />
            </div>

            <div className="bg-card border rounded-2xl p-8 lg:p-12 max-w-4xl mx-auto shadow-sm">
              <h3 className="text-2xl font-bold mb-6">Unsere Lernziele</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <ul className="space-y-3">
                  <GoalItem text="Produktplanung & Scope-Definition" />
                  <GoalItem text="Implementierung funktionaler Anforderungen" />
                  <GoalItem text="Qualitätssicherung & Testing" />
                </ul>
                <ul className="space-y-3">
                  <GoalItem text="Automatisierung von Releases" />
                  <GoalItem text="Sicheres User & Session Management" />
                  <GoalItem text="Unternehmerisches Denken" />
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function TeamMember({ name, role }: { name: string; role: string }) {
  return (
    <div className="flex flex-col items-center text-center p-6 bg-card border rounded-xl shadow-sm">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <User className="h-10 w-10 text-primary" />
      </div>
      <h3 className="text-lg font-bold">{name}</h3>
      <p className="text-sm text-muted-foreground">{role}</p>
    </div>
  );
}

function ProjectDetailCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-background p-8 rounded-xl border hover:shadow-lg transition-all">
      <div className="text-primary mb-6 bg-primary/10 w-16 h-16 rounded-lg flex items-center justify-center">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function GoalItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-3 text-muted-foreground">
      <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
      <span>{text}</span>
    </li>
  );
}
