import { useEffect, useRef } from 'react';
import { useApiClient, useAuthState, useConnected } from '../lib/api/react';
import { fetchOwnKey } from '../lib/checkInCode';
import { isOfflineAvailable } from '../lib/offlineMode';

/**
 * Keeps the own key of the ID QR code on the device once per session, so the ID works
 * offline even if it was never opened with internet (DigitalIdCard).
 */
export function OwnCheckInKeySync() {
  const client = useApiClient();
  const { isAuthenticated } = useAuthState();
  const connected = useConnected();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !isAuthenticated || !connected || !isOfflineAvailable()) return;
    done.current = true;
    fetchOwnKey(client).catch(() => {
      done.current = false;
    });
  }, [client, connected, isAuthenticated]);
  return null;
}
