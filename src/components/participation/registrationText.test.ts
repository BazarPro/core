import { describe, expect, it } from 'vitest';
import { describeRegistration, spotsLeft } from './registrationText';

const HOUR = 3_600_000;
const now = Date.UTC(2026, 2, 14, 10);

describe('describeRegistration', () => {
  it('names the end of the registration and the places left while it is open', () => {
    const info = describeRegistration(
      { features: { registrationEndsAt: now + HOUR }, vendorLimit: 20, sellerCount: 19 },
      now
    );
    expect(info.blocked).toBeUndefined();
    expect(info.until).toMatch(/^Anmeldung bis /);
    expect(info.spots).toBe('Nur noch ein Platz von 20 frei');
  });

  it('says nothing extra without an end or a limit', () => {
    expect(describeRegistration({}, now)).toEqual({ until: undefined, spots: undefined });
  });

  it('is blocked when all places are taken; an invitation does not make room', () => {
    const info = describeRegistration({ vendorLimit: 20, sellerCount: 21 }, now);
    expect(info).toEqual({ blocked: 'Alle Plätze belegt' });
  });

  it('is blocked while closed; an invitation still lets people in', () => {
    const info = describeRegistration({ features: { registrationOpen: false } }, now);
    expect(info).toEqual({ blocked: 'Anmeldung geschlossen', invitationHelps: true });
  });
});

describe('spotsLeft', () => {
  it('counts only with a limit and the number of sellers', () => {
    expect(spotsLeft({ vendorLimit: 10, sellerCount: 4 })).toBe(6);
    expect(spotsLeft({ vendorLimit: 10 })).toBeUndefined();
    expect(spotsLeft({ sellerCount: 4 })).toBeUndefined();
  });
});
