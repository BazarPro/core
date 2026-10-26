import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api/client';
import {
  STEP_SECONDS,
  checkInQrValue,
  codeMatches,
  currentCodes,
  currentStep,
  fetchOwnKeys,
  ownKeys,
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

  it('puts token and codes into the QR code, readable by old and new desks', () => {
    const online = checkInQrValue('AbC123', USER, ['12345678']);
    // Older desks read bazarpro://user/<token> and stop at the "?"
    expect(online.match(/bazarpro:\/\/user\/([a-zA-Z0-9]+)/)?.[1]).toBe('AbC123');
    expect(parseCheckInQr(online)).toEqual({
      token: 'AbC123',
      offline: { userId: USER, codes: ['12345678'] },
    });
    // One code per bazaar of the seller
    expect(parseCheckInQr(checkInQrValue(null, USER, ['12345678', '87654321']))).toEqual({
      offline: { userId: USER, codes: ['12345678', '87654321'] },
    });
    expect(parseCheckInQr('bazarpro://user/AbC123')).toEqual({ token: 'AbC123' });
    expect(parseCheckInQr('https://bazarpro.de/P/123')).toBeNull();
  });

  it('finds the seller of a code with the keys kept on the device', async () => {
    const now = Date.now();
    await writeDeviceJson('check-in/event-evt1', [{ userId: USER, secret: RFC_SEED }]);
    const code = await totp(RFC_SEED, currentStep(now));
    expect(await sellerOfCode('evt1', { userId: USER, codes: [code] }, now)).toBe(USER);
    expect(await sellerOfCode('evt1', { userId: USER, codes: ['11111111', code] }, now)).toBe(USER);
    expect(await sellerOfCode('evt1', { userId: USER, codes: ['11111111'] }, now)).toBeNull();
    expect(await sellerOfCode('evt2', { userId: USER, codes: [code] }, now)).toBeNull();
  });

  it('keeps the own keys of the phone and shows one code per bazaar', async () => {
    const client = new ApiClient();
    const own = {
      userId: USER,
      keys: [
        { eventId: 'evt1', secret: RFC_SEED },
        { eventId: 'evt2', secret: 'b3RoZXI' },
      ],
    };
    vi.spyOn(client, 'mutation').mockResolvedValueOnce(own as never);
    expect(await fetchOwnKeys(client)).toEqual(own);

    // Kept for offline, only for the same user
    expect(await ownKeys(USER)).toEqual(own);
    expect(await ownKeys('someone-else')).toBeNull();

    const now = 1_800_000_000_000;
    const codes = await currentCodes(own, now);
    expect(codes).toHaveLength(2);
    expect(codes[0]).toBe(await totp(RFC_SEED, currentStep(now)));
  });

  it('ignores own keys kept in an older format', async () => {
    await writeDeviceJson('check-in/own', { userId: USER, secret: RFC_SEED });
    expect(await ownKeys(USER)).toBeNull();
  });
});
