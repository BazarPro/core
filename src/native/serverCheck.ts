import { ApiClient, ApiError } from '../lib/api/client';
import { api } from '../lib/api/functions';
import { isNetworkError } from '../lib/offlineMode';
import { MIN_APP_API } from './settings';

/**
 * Whether the server answers like a BazarPro the app works with. True also without
 * connection: offline the app works with what is on the device.
 */
export async function serverFitsApp(server: string): Promise<boolean> {
  try {
    const config = await new ApiClient(server).query(api.instance.getConfig, {});
    return (config.appApi ?? 0) >= MIN_APP_API;
  } catch (error) {
    // Not JSON (a page of another site), 404 of an old version or a gone deployment; a
    // server error may pass, the pages retry
    return isNetworkError(error) || (error instanceof ApiError && error.status >= 500);
  }
}
