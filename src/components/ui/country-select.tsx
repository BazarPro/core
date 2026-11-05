import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { isCountry } from '../../i18n/countries';
import { COUNTRIES } from '../../shared/constants';
import { cn } from '../../lib/utils';

interface CountrySelectProps extends ComponentProps<'select'> {
  /** Value already saved: free text of an older profile stays selectable, not overwritten */
  saved?: string;
  /** Adds a choice for no country, with this label */
  emptyLabel?: string;
}

export function CountrySelect({ saved, emptyLabel, className, ...props }: CountrySelectProps) {
  const { t } = useTranslation('common');
  return (
    <select
      autoComplete="country"
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-70',
        className
      )}
      {...props}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {saved && !isCountry(saved) && <option value={saved}>{saved}</option>}
      {COUNTRIES.map((code) => (
        <option key={code} value={code}>
          {t(`countries.${code}`)}
        </option>
      ))}
    </select>
  );
}
