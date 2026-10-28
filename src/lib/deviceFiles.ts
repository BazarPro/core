import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

/**
 * Small JSON files the app must not lose: the offline queues and keys. In the app a file
 * (the OS may clear the WebView's storage), in the browser localStorage. They belong to
 * the signed-in user (setDeviceOwner): `name` e.g. `offline-checkout/<event>` is the file
 * users/<user>/offline-checkout/<event>.json, the key
 * bazarpro:users:<user>:offline-checkout:<event>. Another user on the device sees none
 * of them, and what one did offline is never sent in the name of another.
 */

let owner: string | null = null;
const ownerListeners = new Set<() => void>();

/** The signed-in user, set by the ApiClient; null when nobody is. */
export function setDeviceOwner(user: string | null) {
  if (user === owner) return;
  owner = user;
  for (const listener of [...ownerListeners]) listener();
}

/** Told when the files now belong to another user: what was read of them is stale. */
export function onDeviceOwnerChange(listener: () => void): () => void {
  ownerListeners.add(listener);
  return () => ownerListeners.delete(listener);
}

function path(name: string) {
  return `users/${owner ?? 'none'}/${name}`;
}

function localKey(name: string) {
  return `bazarpro:${path(name).replaceAll('/', ':')}`;
}

/** The stored value, or null when there is none or it cannot be read. */
export async function readDeviceJson<T>(name: string): Promise<T | null> {
  let raw: string | null = null;
  if (Capacitor.isNativePlatform()) {
    try {
      const file = await Filesystem.readFile({
        path: `${path(name)}.json`,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      raw = typeof file.data === 'string' ? file.data : null;
    } catch {
      raw = null; // no file yet
    }
  } else {
    try {
      raw = localStorage.getItem(localKey(name));
    } catch {
      raw = null;
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeDeviceJson(name: string, value: unknown): Promise<void> {
  const data = JSON.stringify(value);
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: `${path(name)}.json`,
      data,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return;
  }
  localStorage.setItem(localKey(name), data);
}

/** Deletes the files of the signed-in user under `dir`, e.g. `check-in`. */
export async function removeDeviceFiles(dir: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.rmdir({ path: path(dir), directory: Directory.Data, recursive: true });
    } catch {
      // Nothing there
    }
    return;
  }
  try {
    const prefix = `${localKey(dir)}:`;
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) if (key?.startsWith(prefix)) localStorage.removeItem(key);
  } catch {
    // No storage
  }
}
