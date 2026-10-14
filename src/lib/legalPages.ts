import type { SitePageSlug } from '../../convex/constants';
import { PLACEHOLDER_PATTERN } from '../../convex/constants';
import bazarproImprint from '../content/legal/bazarpro/imprint.md?raw';
import bazarproPrivacy from '../content/legal/bazarpro/privacy.md?raw';
import bazarproTerms from '../content/legal/bazarpro/terms.md?raw';
import templateImprint from '../content/legal/templates/imprint.md?raw';
import templatePrivacy from '../content/legal/templates/privacy.md?raw';
import templateTerms from '../content/legal/templates/terms.md?raw';

export interface LegalPageInfo {
  slug: SitePageSlug;
  path: string;
  /** Heading of the page and menu label */
  title: string;
  description: string;
  /** Texts of bazarpro.de, shown until admins save their own version */
  bazarpro: string;
  /** Starting point for self-hosted instances, with [[placeholders]] */
  template: string;
}

export const LEGAL_PAGES: Record<SitePageSlug, LegalPageInfo> = {
  imprint: {
    slug: 'imprint',
    path: '/imprint',
    title: 'Impressum',
    description: 'Impressum – Angaben zum Betreiber dieser Seite.',
    bazarpro: bazarproImprint,
    template: templateImprint,
  },
  privacy: {
    slug: 'privacy',
    path: '/privacy',
    title: 'Datenschutzerklärung',
    description: 'Datenschutzerklärung: welche Daten verarbeitet werden und welche Rechte du hast.',
    bazarpro: bazarproPrivacy,
    template: templatePrivacy,
  },
  terms: {
    slug: 'terms',
    path: '/terms',
    title: 'Allgemeine Geschäftsbedingungen (AGB)',
    description: 'Allgemeine Geschäftsbedingungen für die Nutzung dieser Seite.',
    bazarpro: bazarproTerms,
    template: templateTerms,
  },
};

export function hasPlaceholders(markdown: string): boolean {
  return PLACEHOLDER_PATTERN.test(markdown);
}
