import type { ApiClient } from './api/client';
import { api } from './api/functions';
import type { Id } from './api/types';
import { readDeviceJson, writeDeviceJson } from './deviceFiles';

/**
 * The ID QR code without internet. Besides the 60-second token from the backend it
 * carries a time-based code (TOTP, RFC 6238 with SHA-256, like backend/src/modules/
 * offline.rs): the seller's phone computes it from its key, the team's devices check it
 * with the keys of their event's sellers.
 *
 * `bazarpro://user/<token>?o=<user>.<code>`: older desks read the token as before;
 * offline the phone has no token and puts "offline" in its place.
 */

export const STEP_SECONDS = 30;
/** Codes before and after the current one that still count: clocks of phones differ */
const WINDOW = 2;
const DIGITS = 8;

type Key = { userId: string; secret: string };

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** The code of `secret` (base64url) for time step `counter`. */
export async function totp(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    fromBase64Url(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const message = new DataView(new ArrayBuffer(8));
  message.setBigUint64(0, BigInt(counter));
  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, message.buffer));
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    (hash[offset + 1] << 16) |
    (hash[offset + 2] << 8) |
    hash[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

export async function codeMatches(secret: string, code: string, now = Date.now()) {
  const step = currentStep(now);
  for (let counter = step - WINDOW; counter <= step + WINDOW; counter++) {
    if (counter >= 0 && (await totp(secret, counter)) === code) return true;
  }
  return false;
}

/** What the phone shows; `token` is the 60-second one when online. */
export function checkInQrValue(token: string | null, userId: string, code: string): string {
  return `bazarpro://user/${token ?? 'offline'}?o=${userId}.${code}`;
}

export type ScannedId = {
  /** The 60-second token, if the phone was online */
  token?: string;
  /** The time-based code of the user */
  offline?: { userId: string; code: string };
};

/** The parts of a scanned ID QR code, or null when it is none. */
export function parseCheckInQr(input: string): ScannedId | null {
  const match = input
    .trim()
    .match(/^bazarpro:\/\/user\/([a-zA-Z0-9_-]+)(?:\?o=([0-9a-f-]+)\.(\d+))?$/i);
  if (!match) return null;
  const [, token, userId, code] = match;
  return {
    ...(token !== 'offline' ? { token } : {}),
    ...(userId && code ? { offline: { userId, code } } : {}),
  };
}

// --- the phone's own key

const OWN_KEY = 'check-in/own';

/** Fetches the own key and keeps it, so the ID works offline later. */
export async function fetchOwnKey(client: ApiClient): Promise<Key> {
  const key = await client.mutation(api.offline.ensureCheckInSecret, {});
  await writeDeviceJson(OWN_KEY, key);
  return key;
}

/** The kept key of `userId`; null when this device never fetched it. */
export async function ownKey(userId: string): Promise<Key | null> {
  const key = await readDeviceJson<Key>(OWN_KEY);
  return key?.userId === userId ? key : null;
}

// --- the keys of an event's sellers on the team's devices

const eventKeysName = (eventId: string) => `check-in/event-${eventId}`;

export async function fetchEventKeys(client: ApiClient, eventId: string): Promise<void> {
  const keys = await client.mutation(api.offline.getCheckInSecretsForEvent, {
    eventId: eventId as Id<'events'>,
  });
  await writeDeviceJson(eventKeysName(eventId), keys);
}

/** The seller of a time-based code, checked with the kept keys; null if none matches. */
export async function sellerOfCode(
  eventId: string,
  scanned: { userId: string; code: string },
  now = Date.now()
): Promise<string | null> {
  const keys = (await readDeviceJson<Key[]>(eventKeysName(eventId))) ?? [];
  const key = keys.find((candidate) => candidate.userId === scanned.userId);
  if (!key) return null;
  return (await codeMatches(key.secret, scanned.code, now)) ? key.userId : null;
}
