import i18n from '../../i18n';
import { formatDateTimeDE } from '../../lib/utils';
import type { RegistrationState } from '../../shared/eventFeatures';

/** "Anmeldung geschlossen" or "Anmeldung ab 14.03.2026, 10:00"; nothing while it is open. */
export function registrationClosedText(state: RegistrationState): string | undefined {
  if (state.open) return undefined;
  return state.reason === 'notYet'
    ? i18n.t('registration.opensAt', { ns: 'events', time: formatDateTimeDE(state.opensAt) })
    : i18n.t('registration.closed', { ns: 'events' });
}
