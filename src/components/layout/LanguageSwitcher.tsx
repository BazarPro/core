import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LOCALES, LOCALE_NAMES, type Locale } from '../../shared/constants';
import { useLocale } from '../../i18n/useLocale';
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '../ui/dropdown-menu';

/** Language choice inside a dropdown menu (user menu, theme menu). */
export function LanguageMenuItems() {
  const { t } = useTranslation();
  const [locale, setLocale] = useLocale();
  return (
    <>
      <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
        {t('language.title')}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={locale} onValueChange={(value) => setLocale(value as Locale)}>
        {LOCALES.map((code) => (
          <DropdownMenuRadioItem key={code} value={code} lang={code}>
            {LOCALE_NAMES[code]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

/** Compact language choice, e.g. in the footer. */
export function LanguageSelect({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const [locale, setLocale] = useLocale();
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
      <Globe className="h-4 w-4" aria-hidden />
      <span className="sr-only">{t('language.choose')}</span>
      <select
        className="rounded-md border bg-background px-2 py-1 text-sm text-foreground"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
