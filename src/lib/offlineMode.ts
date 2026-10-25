import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'react';
import { useConnected } from './api/react';

/** Turns the offline features on in the browser, for tests and trying them out */
export const OFFLINE_FLAG_KEY = 'bazarpro:offline-checkout';

/**
 * Whether this device works offline: the app keeps the answers of the backend and the
 * cash desk and intake queue what they do. The browser cannot even load the page without
 * internet, so it only does with the test flag.
 */
export function isOfflineAvailable(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  try {
    return localStorage.getItem(OFFLINE_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/** The connection must be gone this long to count as offline: a short drop is no outage */
export const OFFLINE_AFTER_MS = 2000;

/** Whether the connection to the backend has been gone for a moment. */
export function useDisconnected(): boolean {
  const connected = useConnected();
  const [disconnected, setDisconnected] = useState(false);
  useEffect(() => {
    if (connected) {
      setDisconnected(false);
      return;
    }
    const timer = setTimeout(() => setDisconnected(true), OFFLINE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [connected]);
  return disconnected;
}

/** fetch without answer: "Failed to fetch" (Chrome), "NetworkError …" (Firefox), "Load failed" (Safari) */
const NETWORK_MESSAGE = /failed to fetch|networkerror|load failed|network request failed/i;

/** A call that got no answer at all: no connection, or it timed out. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof TypeError && NETWORK_MESSAGE.test(error.message);
}
