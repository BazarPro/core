import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

/**
 * Small JSON files the app must not lose: the offline queues and keys. In the app a file
 * (the OS may clear the WebView's storage), in the browser localStorage. `name` is e.g.
 * `offline-checkout/<event>`: the file offline-checkout/<event>.json, the key
 * bazarpro:offline-checkout:<event>.
 */

function localKey(name: string) {
  return `bazarpro:${name.replaceAll('/', ':')}`;
}

/** The stored value, or null when there is none or it cannot be read. */
export async function readDeviceJson<T>(name: string): Promise<T | null> {
  let raw: string | null = null;
  if (Capacitor.isNativePlatform()) {
    try {
      const file = await Filesystem.readFile({
        path: `${name}.json`,
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
      path: `${name}.json`,
      data,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return;
  }
  localStorage.setItem(localKey(name), data);
}
