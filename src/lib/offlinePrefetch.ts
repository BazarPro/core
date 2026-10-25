import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from './api/client';
import { api } from './api/functions';
import { useApiClient, useConnected } from './api/react';
import type { Id } from './api/types';
import { fetchEventKeys } from './checkInCode';
import { downloadSnapshot } from './offlineCheckout';
import { isOfflineAvailable } from './offlineMode';

/**
 * Loads a bazaar for the team to work without internet: the answers the organizer pages
 * and every product page ask for, kept on the device as if each page had been opened
 * (ApiClient.batchQuery), plus the cash desk's copy and the keys of the sellers' IDs.
 *
 * The arguments must be exactly those of the pages, in the same order: the answers are
 * found by the JSON of them (see the useQuery calls named in the comments).
 */

type Call = { fn: unknown; args: Record<string, unknown> };

/** Queries per request; the backend takes at most 500 (MAX_BATCH) */
const BATCH = 400;
/** Prepared again when older; opening an event page online starts it */
const FRESH_MS = 30 * 60 * 1000;

async function batched(client: ApiClient, calls: Call[]): Promise<unknown[]> {
  const answers: unknown[] = [];
  for (let start = 0; start < calls.length; start += BATCH) {
    answers.push(...(await client.batchQuery(calls.slice(start, start + BATCH))));
  }
  return answers;
}

/** What the organizer pages of the event ask for (EventManagementDashboard, ProductManagementPage, SellerManagementPage, CashReconciliationPage, SettingsPage). */
function eventCalls(eventId: Id<'events'>): Call[] {
  return [
    { fn: api.users.viewer, args: {} },
    { fn: api.moderation.isViewerAdmin, args: {} },
    { fn: api.events.getEvent, args: { id: eventId } },
    { fn: api.eventRoles.getMyRolesForEvent, args: { eventId } },
    { fn: api.eventProducts.getProductsForEventManagement, args: { eventId } },
    { fn: api.eventRoles.getVendorsForEvent, args: { eventId } },
    { fn: api.eventLocationCategories.listForEvent, args: { eventId } },
    { fn: api.events.getEventFinancialSummary, args: { eventId } },
    { fn: api.purchases.getSaleConflicts, args: { eventId } },
    { fn: api.offline.getFailedActions, args: { eventId } },
  ];
}

type ManagedProduct = { _id: string; acceptsOffers?: boolean };
type ProductPage = { images?: string[] } | null | undefined;

/** What a product page asks for itself (PublicProduct and its components). */
function productCalls(eventId: Id<'events'>, product: ManagedProduct): Call[] {
  const productId = product._id as Id<'products'>;
  return [
    { fn: api.products.getProduct, args: { productId } },
    { fn: api.eventProducts.getEventIdsForProduct, args: { productId } },
    { fn: api.eventProducts.getEventLocationsForProduct, args: { productId } },
    { fn: api.productQuestions.listForProduct, args: { productId } },
    { fn: api.eventProducts.getEventProduct, args: { eventId, productId } },
    ...(product.acceptsOffers ? [{ fn: api.offers.getOffersForStaff, args: { productId } }] : []),
  ];
}

export type PrepareResult = { products: number; at: number };

/** Loads everything of the event for offline use; throws without connection. */
export async function prepareEventForOffline(
  client: ApiClient,
  eventId: string
): Promise<PrepareResult> {
  const id = eventId as Id<'events'>;
  const [, , , , managed] = await batched(client, eventCalls(id));
  const products = (Array.isArray(managed) ? managed : []) as ManagedProduct[];

  // Product pages: first what only needs the product, then what its answers name
  const calls = products.flatMap((product) => productCalls(id, product));
  const answers = await batched(client, calls);
  const followUps: Call[] = [];
  const eventIdLists = new Set<string>();
  let index = 0;
  for (const product of products) {
    const page = answers[index] as ProductPage;
    const eventIds = answers[index + 1];
    index += productCalls(id, product).length;
    if (page?.images && page.images.length > 0) {
      followUps.push({ fn: api.products.getImageUrls, args: { storageIds: page.images } });
    }
    if (Array.isArray(eventIds) && eventIds.length > 0) {
      const key = JSON.stringify(eventIds);
      if (!eventIdLists.has(key)) {
        eventIdLists.add(key);
        followUps.push({ fn: api.events.getEvents, args: { ids: eventIds } });
      }
    }
  }
  await batched(client, followUps);

  await Promise.all([downloadSnapshot(client, eventId), fetchEventKeys(client, eventId)]);
  // "Ready" only once it is stored: the app may be closed right after
  await client.persistNow();
  const result = { products: products.length, at: Date.now() };
  try {
    localStorage.setItem(preparedKey(eventId), JSON.stringify(result));
  } catch {
    // Only the note when it was prepared is lost
  }
  return result;
}

const preparedKey = (eventId: string) => `bazarpro:offline-prepared:${eventId}`;

export function lastPrepared(eventId: string): PrepareResult | null {
  try {
    const raw = localStorage.getItem(preparedKey(eventId));
    return raw ? (JSON.parse(raw) as PrepareResult) : null;
  } catch {
    return null;
  }
}

const running = new Map<string, Promise<PrepareResult>>();

/**
 * Keeps the event ready for offline use while the team works on it online: prepared on
 * opening when older than FRESH_MS, and again on `prepare`.
 */
export function useOfflinePreparation(eventId: string | undefined, enabled: boolean) {
  const client = useApiClient();
  const connected = useConnected();
  const available = isOfflineAvailable() && enabled && !!eventId;
  const [prepared, setPrepared] = useState(() => (eventId ? lastPrepared(eventId) : null));
  const [preparing, setPreparing] = useState(false);

  const prepare = useCallback(async () => {
    if (!eventId) return;
    let run = running.get(eventId);
    if (!run) {
      run = prepareEventForOffline(client, eventId).finally(() => running.delete(eventId));
      running.set(eventId, run);
    }
    setPreparing(true);
    try {
      setPrepared(await run);
    } catch {
      // No connection; what is on the device stays
    } finally {
      setPreparing(false);
    }
  }, [client, eventId]);

  useEffect(() => {
    if (!available || !connected || !eventId) return;
    const last = lastPrepared(eventId);
    if (!last || Date.now() - last.at > FRESH_MS) void prepare();
  }, [available, connected, eventId, prepare]);

  return { available, prepared, preparing, prepare };
}
