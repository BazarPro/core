import { BookOpen, Github, Server } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { DOCS_URL, GITHUB_URL, SELFHOST_URL } from '../../../../lib/links';

/** Open-source band shared by the features, pricing and about pages. */
export function OpenSourceSection() {
  return (
    <section className="py-20 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto grid max-w-5xl items-center gap-10 rounded-[2rem] border bg-card p-8 shadow-sm sm:p-12 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              Open Source (MIT)
            </p>
            <h2 className="text-balance text-3xl font-bold tracking-tight">
              Offener Code, eigener Server möglich
            </h2>
            <p className="text-pretty text-lg text-muted-foreground">
              Der komplette Code von BazarPro liegt auf GitHub. Du kannst ihn prüfen, verbessern
              oder BazarPro mit Docker auf deinem eigenen Server betreiben – etwa für deinen Verein
              oder deine Gemeinde.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button asChild size="lg" className="h-12 justify-start text-base">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <Github className="mr-3 h-5 w-5" />
                Code auf GitHub
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 justify-start text-base">
              <a href={SELFHOST_URL} target="_blank" rel="noopener noreferrer">
                <Server className="mr-3 h-5 w-5" />
                Anleitung: Selbst hosten
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 justify-start text-base">
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                <BookOpen className="mr-3 h-5 w-5" />
                Dokumentation
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
