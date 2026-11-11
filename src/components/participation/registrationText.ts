import i18n from '../../i18n';
import { formatDateTimeDE } from '../../lib/utils';
import {
  getRegistrationState,
  type RegistrationState,
  type StoredEventFeatures,
} from '../../shared/eventFeatures';

/** What a bazaar tells people who think about selling there. */
export type RegistrationEvent = {
  features?: StoredEventFeatures;
  vendorLimit?: number;
  /** Places taken; the backend sends it with a `vendorLimit` */
  sellerCount?: number;
};

/** Places left for sellers; undefined without a limit. */
export function spotsLeft(event: RegistrationEvent): number | undefined {
  const { vendorLimit, sellerCount } = event;
  if (!vendorLimit || vendorLimit <= 0 || sellerCount === undefined) return undefined;
  return Math.max(0, vendorLimit - sellerCount);
}

/** "Anmeldung geschlossen" or "Anmeldung ab 14.03.2026, 10:00"; nothing while it is open. */
export function registrationClosedText(state: RegistrationState): string | undefined {
  if (state.open) return undefined;
  return state.reason === 'notYet'
    ? i18n.t('registration.opensAt', { ns: 'events', time: formatDateTimeDE(state.opensAt) })
    : i18n.t('registration.closed', { ns: 'events' });
}

export interface RegistrationInfo {
  /** Why nobody joins on their own right now: closed, not open yet, or all places taken */
  blocked?: string;
  /** Only an invitation helps (closed or not open yet), not with all places taken */
  invitationHelps?: boolean;
  /** While open with an end: "Anmeldung bis 14.03.2026, 18:00" */
  until?: string;
  /** While open with a seller limit: "Noch 12 von 50 Plätzen frei" */
  spots?: string;
}

/**
 * The registration as sellers see it on the bazaar page, in the list and in the join
 * dialog: whether they can join, until when, and how many places are left.
 */
export function describeRegistration(event: RegistrationEvent, now: number): RegistrationInfo {
  const state = getRegistrationState(event, now);
  const closed = registrationClosedText(state);
  if (closed) return { blocked: closed, invitationHelps: true };
  const left = spotsLeft(event);
  if (left === 0) return { blocked: i18n.t('registration.full', { ns: 'events' }) };
  return {
    until:
      state.open && state.closesAt !== undefined
        ? i18n.t('registration.until', { ns: 'events', time: formatDateTimeDE(state.closesAt) })
        : undefined,
    spots:
      left === undefined
        ? undefined
        : i18n.t('registration.spotsLeft', { ns: 'events', count: left, limit: event.vendorLimit }),
  };
}
