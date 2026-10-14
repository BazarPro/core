import type { PlausibleTarget } from './analyticsConfig';

/** Line in a legal text that is replaced by the analytics section when Plausible is on. */
export const ANALYTICS_DIRECTIVE = '{{webanalyse}}';

const DIRECTIVE_LINE = /^[ \t]*\{\{webanalyse\}\}[ \t]*$/gm;

function analyticsSection(target: PlausibleTarget): string {
  let server = target.apiHost;
  try {
    server = new URL(target.apiHost).host;
  } catch {
    // show the configured value as is
  }
  return [
    '## Webanalyse mit Plausible Analytics',
    `Wir nutzen auf dieser Website den Analysedienst Plausible Analytics (Open-Source-Software der Plausible Insights OÜ, Västriku tn 2, 50403 Tartu, Estland). Die Aufrufe werden an den Server ${server} übermittelt und dort ausgewertet.`,
    'Plausible Analytics dient der statistischen Auswertung der Besucherzahlen und des Nutzungsverhaltens, um unser Angebot zu verbessern. Dabei werden keine Cookies gesetzt und keine personenbezogenen Daten gespeichert. Die IP-Adresse wird lediglich in anonymisierter (gehashter) Form kurzzeitig verarbeitet, um Unique Visitors zu unterscheiden. Eine Identifizierung einzelner Besucher ist nicht möglich. Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse). Unser berechtigtes Interesse liegt in der bedarfsgerechten Gestaltung und Optimierung unserer Website.',
  ].join('\n\n');
}

/** Fills in the building blocks of a legal text, e.g. the analytics section. */
export function applyLegalDirectives(markdown: string, plausible: PlausibleTarget | null): string {
  return markdown
    .replace(DIRECTIVE_LINE, plausible ? analyticsSection(plausible) : '')
    .replace(/\n{3,}/g, '\n\n');
}
