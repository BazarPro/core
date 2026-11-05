import i18n from '.';
import { COUNTRIES, type Country } from '../shared/constants';

export function isCountry(value: string | null | undefined): value is Country {
  return COUNTRIES.some((code) => code === value);
}

/** Name in the current language; older profiles and records may hold free text, shown as is. */
export function countryName(value: string): string {
  return isCountry(value) ? (i18n.t(`countries.${value}`, { ns: 'common' }) as string) : value;
}
