import { beforeEach, describe, expect, it } from 'vitest';
import {
  STEP_SECONDS,
  checkInQrValue,
  codeMatches,
  currentStep,
  parseCheckInQr,
  sellerOfCode,
  totp,
} from './checkInCode';
import { writeDeviceJson } from './deviceFiles';

/** "12345678901234567890123456789012", the SHA-256 seed of RFC 6238, as base64url */
const RFC_SEED = btoa('12345678901234567890123456789012').replace(/=+$/, '');
const USER = '0b6f1c3e-6a5b-4c7d-8e9f-0a1b2c3d4e5f';

describe('time-based ID code', () => {
  beforeEach(() => localStorage.clear());

  it('computes the codes of RFC 6238 with SHA-256, like the backend', async () => {
    expect(await totp(RFC_SEED, 1)).toBe('46119246');
    expect(await totp(RFC_SEED, Math.floor(1111111109 / 30))).toBe('68084774');
  });

  it('accepts a code for about a minute around now', async () => {
    const now = 1_800_000_000_000;
    const code = await totp(RFC_SEED, currentStep(now));
    expect(await codeMatches(RFC_SEED, code, now)).toBe(true);
    expect(await codeMatches(RFC_SEED, code, now + 55_000)).toBe(true);
    expect(await codeMatches(RFC_SEED, code, now + 4 * STEP_SECONDS * 1000)).toBe(false);
    expect(await codeMatches(RFC_SEED, '00000000', now)).toBe(false);
  });

  it('puts token and code into the QR code, readable by old and new desks', () => {
    const online = checkInQrValue('AbC123', USER, '12345678');
    // Older desks read bazarpro://user/<token> and stop at the "?"
    expect(online.match(/bazarpro:\/\/user\/([a-zA-Z0-9]+)/)?.[1]).toBe('AbC123');
    expect(parseCheckInQr(online)).toEqual({
      token: 'AbC123',
      offline: { userId: USER, code: '12345678' },
    });
    expect(parseCheckInQr(checkInQrValue(null, USER, '12345678'))).toEqual({
      offline: { userId: USER, code: '12345678' },
    });
    expect(parseCheckInQr('bazarpro://user/AbC123')).toEqual({ token: 'AbC123' });
    expect(parseCheckInQr('https://bazarpro.de/P/123')).toBeNull();
  });

  it('finds the seller of a code with the keys kept on the device', async () => {
    const now = Date.now();
    await writeDeviceJson('check-in/event-evt1', [{ userId: USER, secret: RFC_SEED }]);
    const code = await totp(RFC_SEED, currentStep(now));
    expect(await sellerOfCode('evt1', { userId: USER, code }, now)).toBe(USER);
    expect(await sellerOfCode('evt1', { userId: USER, code: '11111111' }, now)).toBeNull();
    expect(await sellerOfCode('evt2', { userId: USER, code }, now)).toBeNull();
  });
});
