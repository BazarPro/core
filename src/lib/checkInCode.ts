import type { ApiClient } from './api/client';
import { api } from './api/functions';
import type { Id } from './api/types';
import { readDeviceJson, writeDeviceJson } from './deviceFiles';
import { isNetworkError } from './offlineMode';

/**
 * The ID QR code without internet. Besides the 60-second token from the backend it
 * carries time-based codes (TOTP, RFC 6238 with SHA-256, like backend/src/modules/
 * offline.rs), one per running or coming bazaar of the seller: the keys are per user and
 * event, so a team device that has the keys of its bazaar cannot make codes for another.
 * The seller's phone computes them from its kept keys, the team's devices check them
 * with the keys of their event's sellers.
 *
 * `bazarpro://user/<token>?o=<user>.<code>[.<code>…]`: older desks read the token as
 * before; offline the phone has no token and puts "offline" in its place.
 */

export const STEP_SECONDS = 30;
/** Codes before and after the current one that still count: clocks of phones differ */
const WINDOW = 2;
const DIGITS = 8;

/** A seller's key for one event, on the team's devices */
type Key = { userId: string; secret: string };
/** The phone's own keys, one per running or coming bazaar, in the event's key version */
export type OwnKeys = {
  userId: string;
  keys: { eventId: string; version?: number; secret: string }[];
};

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

/** The codes of all own bazaars now. */
export function currentCodes(own: OwnKeys, now = Date.now()): Promise<string[]> {
  return Promise.all(own.keys.map((key) => totp(key.secret, currentStep(now))));
}

/** What the phone shows; `token` is the 60-second one when online. */
export function checkInQrValue(token: string | null, userId: string, codes: string[]): string {
  return `bazarpro://user/${token ?? 'offline'}?o=${[userId, ...codes].join('.')}`;
}

export type ScannedId = {
  /** The 60-second token, if the phone was online */
  token?: string;
  /** The time-based codes of the user, one per bazaar */
  offline?: { userId: string; codes: string[] };
};

/** Bazaars the phone shows a code for at once, like the backend (MAX_OWN_EVENTS) */
const MAX_CODES = 4;
const ID_QR = new RegExp(
  `^bazarpro://user/([a-zA-Z0-9_-]+)(?:\\?o=([0-9a-f-]+)((?:\\.\\d{${DIGITS}}){1,${MAX_CODES}}))?$`,
  'i'
);

/**
 * The parts of a scanned ID QR code, or null when it is none. More codes than a phone
 * shows, or ones of another length, make no ID: each costs checks, many would be guessing.
 */
export function parseCheckInQr(input: string): ScannedId | null {
  const match = input.trim().match(ID_QR);
  if (!match) return null;
  const [, token, userId, codes] = match;
  return {
    ...(token !== 'offline' ? { token } : {}),
    ...(userId && codes ? { offline: { userId, codes: codes.slice(1).split('.') } } : {}),
  };
}

// --- the phone's own key

const OWN_KEY = 'check-in/own';

/** Fetches the own keys and keeps them, so the ID works offline later. */
export async function fetchOwnKeys(client: ApiClient): Promise<OwnKeys> {
  const own = await client.mutation(api.offline.ensureCheckInSecret, {});
  await writeDeviceJson(OWN_KEY, own);
  return own;
}

/** The kept keys of `userId`; null when this device never fetched them. */
export async function ownKeys(userId: string): Promise<OwnKeys | null> {
  const own = await readDeviceJson<OwnKeys>(OWN_KEY);
  return own?.userId === userId && Array.isArray(own.keys) ? own : null;
}

/**
 * Whether the kept keys are those of the bazaars and key versions the backend names
 * (offline.getOwnCheckInVersions); else the phone fetches them again.
 */
export async function ownKeysCurrent(
  userId: string,
  versions: { eventId: string; version: number }[]
): Promise<boolean> {
  const own = await ownKeys(userId);
  const stamp = (keys: { eventId: string; version?: number }[]) =>
    keys.map(({ eventId, version }) => `${eventId}:${version ?? 0}`).join();
  return !!own && stamp(own.keys) === stamp(versions);
}

// --- the keys of an event's sellers on the team's devices

const eventKeysName = (eventId: string) => `check-in/event-${eventId}`;

export async function fetchEventKeys(client: ApiClient, eventId: string): Promise<void> {
  const keys = await client.mutation(api.offline.getCheckInSecretsForEvent, {
    eventId: eventId as Id<'events'>,
  });
  await writeDeviceJson(eventKeysName(eventId), keys);
}

/** The seller of time-based codes, checked with the kept keys; null if none matches. */
export async function sellerOfCode(
  eventId: string,
  scanned: { userId: string; codes: string[] },
  now = Date.now()
): Promise<string | null> {
  const keys = (await readDeviceJson<Key[]>(eventKeysName(eventId))) ?? [];
  const key = keys.find((candidate) => candidate.userId === scanned.userId);
  if (!key) return null;
  for (const code of scanned.codes) {
    if (await codeMatches(key.secret, code, now)) return key.userId;
  }
  return null;
}

/**
 * The seller of a scanned ID at the event: offline with the kept keys, else asked online,
 * first by the 60-second token, which works for every bazaar, then by the codes. Null
 * when it is no ID or nobody's; "unknown" for an ID with codes the device cannot check
 * without internet: it lacks the seller's key.
 */
export async function sellerOfId(
  client: ApiClient,
  eventId: string,
  input: string
): Promise<{ id: Id<'users'>; name?: string } | 'unknown' | null> {
  const scanned = parseCheckInQr(input);
  if (!scanned) return null;
  if (scanned.offline) {
    const id = await sellerOfCode(eventId, scanned.offline);
    if (id) return { id: id as Id<'users'> };
  }
  const tokens = [
    scanned.token,
    scanned.offline && [scanned.offline.userId, ...scanned.offline.codes].join('.'),
  ].filter((token): token is string => !!token);
  let offline = false;
  for (const token of tokens) {
    try {
      const user = await client.query(api.users.getUserByCheckInToken, {
        token,
        eventId: eventId as Id<'events'>,
      });
      if (user) return { id: user._id, name: user.name };
    } catch (err) {
      // Also after a refused or busy token (429, 5xx) the codes may still find the seller
      offline ||= isNetworkError(err);
    }
  }
  return scanned.offline && offline ? 'unknown' : null;
}
