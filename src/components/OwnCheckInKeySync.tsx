import { useEffect } from 'react';
import { api } from '../lib/api/functions';
import { useApiClient, useAuthState, useConnected, useQuery } from '../lib/api/react';
import { fetchOwnKeys, ownKeysCurrent } from '../lib/checkInCode';
import { isOfflineAvailable } from '../lib/offlineMode';

/**
 * Keeps the own keys of the ID QR code on the device, so the ID works offline even if it
 * was never opened with internet (DigitalIdCard): fetched again whenever the bazaars or
 * their key versions change, e.g. after joining a bazaar or when its keys were renewed.
 */
export function OwnCheckInKeySync() {
  const client = useApiClient();
  const { isAuthenticated } = useAuthState();
  const connected = useConnected();
  const active = isAuthenticated && isOfflineAvailable();
  const viewer = useQuery(api.users.viewer, active ? {} : 'skip');
  const versions = useQuery(api.offline.getOwnCheckInVersions, active ? {} : 'skip');
  const userId = viewer?._id;
  useEffect(() => {
    if (!active || !connected || !userId || !versions) return;
    let current = true;
    void ownKeysCurrent(userId, versions).then(async (fresh) => {
      if (!fresh && current) await fetchOwnKeys(client).catch(() => undefined);
    });
    return () => {
      current = false;
    };
  }, [active, client, connected, userId, versions]);
  return null;
}
