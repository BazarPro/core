import i18n from '.';
import type { CategoryFieldText } from '../shared/categoryFields';

/** Label, placeholder or hint of a category field in the current language. */
export function categoryFieldText(
  field: { text: CategoryFieldText },
  part: 'label' | 'placeholder' | 'hint'
): string | undefined {
  const key = `categoryFields.${field.text}.${part}`;
  return i18n.exists(key, { ns: 'records' })
    ? (i18n.t(key as never, { ns: 'records' }) as string)
    : undefined;
}
