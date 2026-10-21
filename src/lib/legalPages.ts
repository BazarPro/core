import type { SitePageSlug } from '../shared/constants';
import { PLACEHOLDER_PATTERN } from '../shared/constants';
import bazarproImprint from '../content/legal/bazarpro/imprint.md?raw';
import bazarproPrivacy from '../content/legal/bazarpro/privacy.md?raw';
import bazarproTerms from '../content/legal/bazarpro/terms.md?raw';
import templateImprint from '../content/legal/templates/imprint.md?raw';
import templatePrivacy from '../content/legal/templates/privacy.md?raw';
import templateTerms from '../content/legal/templates/terms.md?raw';
import i18n from '../i18n';

export interface LegalPageInfo {
  slug: SitePageSlug;
  path: string;
  /** Default heading of the page, in the current language */
  readonly title: string;
  /** Short name for tabs */
  readonly tab: string;
  readonly description: string;
  /** Texts of bazarpro.de, shown until admins save their own version */
  bazarpro: string;
  /** Starting point for self-hosted instances, with [[placeholders]] */
  template: string;
}

/** Adds the translated texts as getters, so they follow the current language. */
function withTexts(
  slug: SitePageSlug,
  info: Omit<LegalPageInfo, 'slug' | 'title' | 'tab' | 'description'>
): LegalPageInfo {
  return {
    slug,
    ...info,
    get title() {
      return i18n.t(`legal.${slug}.title`, { ns: 'common' });
    },
    get tab() {
      return i18n.t(`legal.${slug}.tab`, { ns: 'common' });
    },
    get description() {
      return i18n.t(`legal.${slug}.description`, { ns: 'common' });
    },
  };
}

export const LEGAL_PAGES: Record<SitePageSlug, LegalPageInfo> = {
  imprint: withTexts('imprint', {
    path: '/imprint',
    bazarpro: bazarproImprint,
    template: templateImprint,
  }),
  privacy: withTexts('privacy', {
    path: '/privacy',
    bazarpro: bazarproPrivacy,
    template: templatePrivacy,
  }),
  terms: withTexts('terms', {
    path: '/terms',
    bazarpro: bazarproTerms,
    template: templateTerms,
  }),
};

export function hasPlaceholders(markdown: string): boolean {
  return PLACEHOLDER_PATTERN.test(markdown);
}
