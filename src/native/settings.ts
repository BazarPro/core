import { Preferences } from '@capacitor/preferences';

/**
 * What the mobile app remembers: the server it talks to (bazarpro.de or a self-hosted
 * instance), that server's mode and the session token. Loaded once at start, so the
 * API client can read the token without waiting.
 */
export type AppSettings = {
  server: string | null;
  mode: string | null;
  token: string | null;
};

const KEYS = { server: 'bazarpro.server', mode: 'bazarpro.mode', token: 'bazarpro.token' };

export const DEFAULT_SERVER = 'https://bazarpro.de';

/** Opens the server choice instead of the app, see startNative */
export const SERVER_CHOICE_PATH = '/choose-server';

/** The saved server, or bazarpro.de as long as no other one was chosen. */
export function appServer(settings: AppSettings): { server: string; mode: string | null } {
  if (settings.server) return { server: settings.server, mode: settings.mode };
  return { server: DEFAULT_SERVER, mode: 'platform' };
}

export async function loadSettings(): Promise<AppSettings> {
  const [server, mode, token] = await Promise.all(
    [KEYS.server, KEYS.mode, KEYS.token].map(async (key) => (await Preferences.get({ key })).value)
  );
  return { server, mode, token };
}

async function store(key: string, value: string | null) {
  if (value === null) await Preferences.remove({ key });
  else await Preferences.set({ key, value });
}

export const saveToken = (token: string | null) => store(KEYS.token, token);

export async function saveServer(server: string | null, mode: string | null) {
  await Promise.all([store(KEYS.server, server), store(KEYS.mode, mode), saveToken(null)]);
}

/** `verein.de` → `https://verein.de`; paths and trailing slashes are dropped. */
export function normalizeServer(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.origin;
  } catch {
    return null;
  }
}

/** To the server choice; the session ends only once another server is saved. */
export function switchServer() {
  window.location.replace(SERVER_CHOICE_PATH);
}
