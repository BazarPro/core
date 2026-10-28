import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from './api/client';
import { api } from './api/functions';
import { useApiClient, useConnected, useQuery } from './api/react';
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
/**
 * Loaded completely again when older, e.g. for changed product pages. Between that only
 * what is new (updateEventForOffline): the organizer pages stay current on their own.
 */
const FULL_MS = 12 * 60 * 60 * 1000;
/** New items or sellers are loaded at most this often, e.g. while sellers register */
const UPDATE_GAP_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Prepared on its own from this long before the start; earlier only by the button */
const SOON_MS = 3 * DAY_MS;

/** Answers of the calls; undefined for a call that failed (twice, with `retry`). */
async function batched(client: ApiClient, calls: Call[], retry = true): Promise<unknown[]> {
  const answers: unknown[] = [];
  for (let start = 0; start < calls.length; start += BATCH) {
    answers.push(...(await client.batchQuery(calls.slice(start, start + BATCH))));
  }
  // Once more what failed, e.g. while the backend was busy
  const failed = answers.flatMap((answer, index) => (answer === undefined ? [index] : []));
  if (retry && failed.length > 0) {
    const again = await batched(
      client,
      failed.map((index) => calls[index]),
      false
    );
    failed.forEach((index, n) => (answers[index] = again[n]));
  }
  return answers;
}

class Incomplete extends Error {
  constructor(missing: number) {
    super(`${missing} answers for the offline copy are missing`);
  }
}

class NotStored extends Error {
  constructor() {
    super('The offline copy could not be stored on the device');
  }
}

/** Without these the team cannot work offline: the item and seller lists */
function essentialCalls(eventId: Id<'events'>): Call[] {
  return [
    { fn: api.eventProducts.getProductsForEventManagement, args: { eventId } },
    { fn: api.eventRoles.getVendorsForEvent, args: { eventId } },
  ];
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
    // Last: what the copy now has (useOfflinePreparation)
    { fn: api.offline.getPreparationStamp, args: { eventId } },
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

/** What the copy depends on (offline.getPreparationStamp): new sellers, new items */
export type PreparationStamp = { keys: string; products: string };

export type PrepareResult = {
  products: number;
  /** Last loaded, completely or what was new */
  at: number;
  /** Last loaded completely */
  fullAt?: number;
  stamp?: PreparationStamp;
};

function asStamp(answer: unknown): PreparationStamp | undefined {
  const stamp = answer as PreparationStamp | null | undefined;
  return typeof stamp?.keys === 'string' && typeof stamp.products === 'string' ? stamp : undefined;
}

/** The pages of `products`: first what only needs the product, then what its answers name. */
async function loadProductPages(client: ApiClient, id: Id<'events'>, products: ManagedProduct[]) {
  const calls = products.flatMap((product) => productCalls(id, product));
  const answers = await batched(client, calls);
  // The team may read every product page: a missing answer is a failure, not a closed page
  const missing = answers.filter((answer) => answer === undefined).length;
  if (missing > 0) throw new Incomplete(missing);
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
}

/** Saves the result once the copy is stored: "ready" only then, the app may be closed. */
async function finish(client: ApiClient, eventId: string, result: PrepareResult) {
  if (!(await client.persistNow())) throw new NotStored();
  const lost = essentialCalls(eventId as Id<'events'>).filter(
    ({ fn, args }) => !client.isOnDevice(fn as never, args)
  );
  if (lost.length > 0) throw new Incomplete(lost.length);
  try {
    localStorage.setItem(preparedKey(eventId), JSON.stringify(result));
  } catch {
    // Only the note when it was prepared is lost
  }
  return result;
}

/** Loads everything of the event for offline use; throws without connection. */
export async function prepareEventForOffline(
  client: ApiClient,
  eventId: string
): Promise<PrepareResult> {
  const id = eventId as Id<'events'>;
  const [, , , , managed] = await batched(client, eventCalls(id));
  // Without the item list nothing works offline; other organizer pages may be closed to helpers
  if (!Array.isArray(managed)) throw new Incomplete(1);
  const products = managed as ManagedProduct[];
  await loadProductPages(client, id, products);

  await Promise.all([downloadSnapshot(client, eventId), fetchEventKeys(client, eventId)]);
  // The event's own answers once more, as the newest: the device drops the oldest first
  const answers = await batched(client, eventCalls(id));
  const at = Date.now();
  return finish(client, eventId, {
    products: products.length,
    at,
    fullAt: at,
    stamp: asStamp(answers[answers.length - 1]),
  });
}

/**
 * Loads what is new since `last`: the keys when sellers joined or the keys were renewed,
 * the pages of items the device lacks and the cash desk's copy when items were added.
 */
export async function updateEventForOffline(
  client: ApiClient,
  eventId: string,
  last: PrepareResult
): Promise<PrepareResult> {
  const id = eventId as Id<'events'>;
  const [managed, , stampAnswer] = await batched(client, [
    ...essentialCalls(id),
    { fn: api.offline.getPreparationStamp, args: { eventId: id } },
  ]);
  if (!Array.isArray(managed)) throw new Incomplete(1);
  const products = managed as ManagedProduct[];
  const stamp = asStamp(stampAnswer);
  const work: Promise<unknown>[] = [];
  if (!stamp || stamp.keys !== last.stamp?.keys) work.push(fetchEventKeys(client, eventId));
  if (!stamp || stamp.products !== last.stamp?.products) {
    const missing = products.filter(
      (product) =>
        !client.isOnDevice(api.products.getProduct, { productId: product._id as Id<'products'> })
    );
    work.push(loadProductPages(client, id, missing), downloadSnapshot(client, eventId));
  }
  await Promise.all(work);
  return finish(client, eventId, {
    products: products.length,
    at: Date.now(),
    fullAt: last.fullAt ?? last.at,
    stamp,
  });
}

const preparedKey = (eventId: string) => `bazarpro:offline-prepared:${eventId}`;

/**
 * When the event was last prepared; null when never, or when the device no longer has
 * its item and seller lists (dropped on another sign-in, or as the oldest answers).
 */
export function lastPrepared(client: ApiClient, eventId: string): PrepareResult | null {
  const id = eventId as Id<'events'>;
  if (essentialCalls(id).some(({ fn, args }) => !client.isOnDevice(fn as never, args))) {
    return null;
  }
  try {
    const raw = localStorage.getItem(preparedKey(eventId));
    return raw ? (JSON.parse(raw) as PrepareResult) : null;
  } catch {
    return null;
  }
}

/** Whether the copy lacks sellers or items the backend has now. */
export function isOutdated(prepared: PrepareResult | null, stamp: PreparationStamp | undefined) {
  return (
    !!prepared &&
    !!stamp &&
    (stamp.keys !== prepared.stamp?.keys || stamp.products !== prepared.stamp?.products)
  );
}

type EventDates = { startDate: number; endDate: number };

const running = new Map<string, Promise<PrepareResult>>();

/**
 * Keeps the event ready for offline use while the team works on it online, for running
 * and coming bazaars (`event`, the team only with `allowed`): prepared completely on its
 * own from SOON_MS before the start and when older than FULL_MS, else only what is new
 * (updateEventForOffline); completely again on `prepare`.
 */
export function useOfflinePreparation(
  eventId: string | undefined,
  event: EventDates | null | undefined,
  allowed: boolean
) {
  const client = useApiClient();
  const connected = useConnected();
  const now = Date.now();
  const relevant = !!event && event.endDate > now - DAY_MS;
  const available = isOfflineAvailable() && allowed && !!eventId && relevant;
  const soon = available && !!event && event.startDate < now + SOON_MS;
  const stamp = useQuery(
    api.offline.getPreparationStamp,
    available ? { eventId: eventId as Id<'events'> } : 'skip'
  );
  const [prepared, setPrepared] = useState(() => (eventId ? lastPrepared(client, eventId) : null));
  const [preparing, setPreparing] = useState(false);
  const outdated = isOutdated(prepared, stamp);

  const run = useCallback(
    async (load: (client: ApiClient, eventId: string) => Promise<PrepareResult>) => {
      if (!eventId) return;
      let job = running.get(eventId);
      if (!job) {
        job = load(client, eventId).finally(() => running.delete(eventId));
        running.set(eventId, job);
      }
      setPreparing(true);
      try {
        setPrepared(await job);
      } catch {
        // No connection; what is on the device stays
      } finally {
        setPreparing(false);
      }
    },
    [client, eventId]
  );
  const prepare = useCallback(() => run(prepareEventForOffline), [run]);

  // Completely: never prepared, or long ago
  useEffect(() => {
    if (!soon || !connected || !eventId) return;
    const last = lastPrepared(client, eventId);
    if (!last || Date.now() - (last.fullAt ?? last.at) > FULL_MS) void prepare();
  }, [client, connected, eventId, prepare, soon]);

  // What is new, also for a bazaar prepared by hand: new sellers must be recognised
  useEffect(() => {
    if (!available || !connected || !eventId || !outdated) return;
    const last = lastPrepared(client, eventId);
    if (!last) return;
    const timer = setTimeout(
      () => void run((client, eventId) => updateEventForOffline(client, eventId, last)),
      Math.max(0, last.at + UPDATE_GAP_MS - Date.now())
    );
    return () => clearTimeout(timer);
  }, [available, client, connected, eventId, outdated, run]);

  return { available, prepared, preparing, outdated, prepare };
}
