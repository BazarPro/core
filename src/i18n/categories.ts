import type { CategoryTranslations } from '../lib/api/types';
import i18n from '.';

type NamedCategory = { label: string; translations?: CategoryTranslations | undefined };

/**
 * The name of a category in the current language. For display only: the extra fields and
 * the bazaar types go by `label`, whatever the language.
 */
export function categoryName(category: NamedCategory): string {
  return (i18n.resolvedLanguage === 'en' && category.translations?.en) || category.label;
}

/** The names of the given ids; undefined until the list is there or if one is missing. */
export function categoryNames(
  ids: readonly string[] | undefined,
  categories: readonly (NamedCategory & { _id: string })[] | undefined
): string[] | undefined {
  if (!ids || !categories) return undefined;
  const found = ids.map((id) => categories.find((category) => category._id === id));
  return found.every((category) => category !== undefined)
    ? found.map((category) => categoryName(category as NamedCategory))
    : undefined;
}
