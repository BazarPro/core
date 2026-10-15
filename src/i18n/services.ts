import i18n from '.';

/** Name of an event service in the current language; the stored value stays German. */
export function serviceLabel(service: string): string {
  const key = `service.${service}`;
  return i18n.exists(key, { ns: 'records' })
    ? (i18n.t(key as never, { ns: 'records' }) as string)
    : service;
}
