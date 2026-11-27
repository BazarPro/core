import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { isCountry } from '../../i18n/countries';
import { COUNTRIES } from '../../shared/constants';
import { NativeSelect } from './native-select';

interface CountrySelectProps extends ComponentProps<'select'> {
  /** Value already saved: free text of an older profile stays selectable, not overwritten */
  saved?: string;
  /** Adds a choice for no country, with this label */
  emptyLabel?: string;
}

export function CountrySelect({ saved, emptyLabel, className, ...props }: CountrySelectProps) {
  const { t } = useTranslation('common');
  return (
    // Drawn like the other fields; on phones the system picker opens
    <NativeSelect autoComplete="country" className={className} {...props}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {saved && !isCountry(saved) && <option value={saved}>{saved}</option>}
      {COUNTRIES.map((code) => (
        <option key={code} value={code}>
          {t(`countries.${code}`)}
        </option>
      ))}
    </NativeSelect>
  );
}
