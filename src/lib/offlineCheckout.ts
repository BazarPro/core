import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api/functions';
import type { ApiClient } from './api/client';
import { useApiClient, useConnected } from './api/react';
import { deviceOwner, onDeviceOwnerChange, readDeviceJson, writeDeviceJson } from './deviceFiles';
import { getUserFacingErrorMessage } from './errors';
import type { FunctionArgs, FunctionReturnType, Id } from './api/types';
import {
  OFFLINE_AFTER_MS,
  OFFLINE_FLAG_KEY,
  isOfflineAvailable,
  isPermanentRefusal,
  useDisconnected,
} from './offlineMode';

/**
 * The cash desk without internet, in the app: before the bazaar it keeps a copy of every
 * item of the event (getCheckoutSnapshot). Offline it sells from that copy and queues the
 * sales on the device; once online the queue is booked (syncOfflineSales). Each sale has
 * its own ID, so sending it twice books it once. An item another desk sold meanwhile
 * becomes a conflict the team settles in the cash reconciliation.
 */

export type CheckoutSnapshot = FunctionReturnType<typeof api.purchases.getCheckoutSnapshot>;
export type SnapshotItem = CheckoutSnapshot['items'][number];
export type OfflineSale = FunctionArgs<typeof api.purchases.syncOfflineSales>['sales'][number];

export type OfflineState = {
  snapshot: CheckoutSnapshot | null;
  /** Sales not booked yet, oldest first */
  queue: OfflineSale[];
};

/** Sales per sync call; the backend takes at most 50 (MAX_SYNC_SALES) */
const SYNC_BATCH = 50;
/** While sales wait and the connection is up, booking them is retried this often */
const RETRY_MS = 30_000;

const EMPTY: OfflineState = { snapshot: null, queue: [] };

/** Only the app sells offline: the browser cannot load the page without internet. */
export const isOfflineCheckoutAvailable = isOfflineAvailable;
export { OFFLINE_AFTER_MS, OFFLINE_FLAG_KEY };

// --- storage

async function readStored(eventId: string, user = deviceOwner()): Promise<OfflineState> {
  const parsed = await readDeviceJson<Partial<OfflineState>>(`offline-checkout/${eventId}`, user);
  if (!parsed) return EMPTY;
  return {
    snapshot: parsed.snapshot ?? null,
    queue: Array.isArray(parsed.queue) ? parsed.queue : [],
  };
}

function writeStored(eventId: string, state: OfflineState, user: string | null): Promise<void> {
  return writeDeviceJson(`offline-checkout/${eventId}`, state, user);
}

// --- state per event, shared by every component that shows it

const states = new Map<string, OfflineState>();
/**
 * Why the backend refuses the whole sync, e.g. the user left the team: retrying will not
 * help, so it waits for the team (useOfflineCheckout retry). Sales are never dropped.
 */
const blocked = new Map<string, string>();
const loading = new Map<string, Promise<OfflineState>>();
const listeners = new Set<() => void>();
/** Writes one after the other, so a slow write cannot overwrite a newer one */
let writing: Promise<void> = Promise.resolve();

// Another user signed in: their queues, read again for the events shown
/** Counts the user changes: a read started before one is of the other user's file */
let owners = 0;
onDeviceOwnerChange(() => {
  owners += 1;
  const shown = [...states.keys()];
  states.clear();
  loading.clear();
  blocked.clear();
  emit();
  for (const eventId of shown) void loadOfflineState(eventId);
});

function emit() {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadOfflineState(eventId: string): Promise<OfflineState> {
  const known = states.get(eventId);
  if (known) return Promise.resolve(known);
  let pending = loading.get(eventId);
  if (!pending) {
    const reading = owners;
    pending = readStored(eventId).then((state) => {
      if (reading !== owners) return loadOfflineState(eventId);
      // A change made while reading wins over what was stored
      const current = states.get(eventId) ?? state;
      states.set(eventId, current);
      loading.delete(eventId);
      emit();
      return current;
    });
    loading.set(eventId, pending);
  }
  return pending;
}

async function update(eventId: string, change: (state: OfflineState) => OfflineState) {
  // The user who sold it: their file, also when another one signs in meanwhile
  const user = deviceOwner();
  await loadOfflineState(eventId);
  if (deviceOwner() !== user) {
    await serially(async () => writeStored(eventId, change(await readStored(eventId, user)), user));
    return;
  }
  // The current state, read after the await: another update may have run meanwhile
  const next = change(states.get(eventId) ?? EMPTY);
  states.set(eventId, next);
  emit();
  // The caller waits until the sale is on the device before it empties the cart
  await serially(() => writeStored(eventId, next, user));
}

function serially(write: () => Promise<void>): Promise<void> {
  const done = writing.then(write);
  writing = done.catch(() => undefined);
  return done;
}

/** Forgets the copies in memory; for tests. */
export function resetOfflineCheckout() {
  states.clear();
  loading.clear();
  syncing.clear();
  blocked.clear();
}

// --- the copy of the items

/** The item of a scanned product in the copy; null when it is not at this event. */
export function lookupOffline(
  snapshot: CheckoutSnapshot | null,
  productId: string
): SnapshotItem | null {
  return snapshot?.items.find((item) => item.productId === productId) ?? null;
}

/** Loads the current items for offline use; keeps what this desk sold but did not book yet. */
export async function downloadSnapshot(client: ApiClient, eventId: string): Promise<void> {
  const snapshot = await client.query(api.purchases.getCheckoutSnapshot, {
    eventId: eventId as Id<'events'>,
  });
  await update(eventId, (state) => ({
    ...state,
    snapshot: markSold(snapshot, state.queue),
  }));
}

function markSold(snapshot: CheckoutSnapshot, sales: OfflineSale[]): CheckoutSnapshot {
  const sold = new Set(sales.flatMap((sale) => sale.items.map((item) => item.eventProductId)));
  if (sold.size === 0) return snapshot;
  return {
    ...snapshot,
    items: snapshot.items.map((item) =>
      sold.has(item.eventProductId) ? { ...item, status: 'sold' as const } : item
    ),
  };
}

// --- the queue

/** Keeps a sale on the device; its items count as sold for this desk right away. */
export async function enqueueSale(eventId: string, sale: OfflineSale): Promise<void> {
  await update(eventId, (state) => {
    if (state.queue.some((queued) => queued.deskSaleId === sale.deskSaleId)) return state;
    return {
      snapshot: state.snapshot && markSold(state.snapshot, [sale]),
      queue: [...state.queue, sale],
    };
  });
}

export type SyncResult = { booked: number; conflicts: number };

const syncing = new Map<string, Promise<SyncResult>>();

/**
 * Books the queue in batches. A sale leaves the queue once the backend answered for it;
 * on a network error the rest stays for the next try. One run per event at a time.
 */
export function flushQueue(client: ApiClient, eventId: string): Promise<SyncResult> {
  // A run already going: its result counts once, for whoever started it
  const running = syncing.get(eventId);
  if (running) return running.then(() => ({ booked: 0, conflicts: 0 }));
  const run = (async () => {
    const result: SyncResult = { booked: 0, conflicts: 0 };
    for (;;) {
      const { queue } = await loadOfflineState(eventId);
      const batch = queue.slice(0, SYNC_BATCH);
      if (batch.length === 0) return result;
      const synced = await client.mutation(api.purchases.syncOfflineSales, {
        eventId: eventId as Id<'events'>,
        sales: batch,
      });
      const done = new Set(synced.map((sale) => sale.deskSaleId));
      for (const sale of synced) {
        if (!sale.bookedNow) continue;
        result.booked += 1;
        result.conflicts += sale.conflicts.length;
      }
      await update(eventId, (state) => ({
        ...state,
        queue: state.queue.filter((sale) => !done.has(sale.deskSaleId)),
      }));
      if (done.size === 0) return result;
    }
  })()
    .then((result) => {
      if (blocked.delete(eventId)) emit();
      return result;
    })
    .catch((error: unknown) => {
      if (isPermanentRefusal(error)) {
        blocked.set(eventId, getUserFacingErrorMessage(error));
        emit();
      }
      throw error;
    })
    .finally(() => syncing.delete(eventId));
  syncing.set(eventId, run);
  return run;
}

/**
 * The offline state of the cash desk of an event. Online it refreshes the copy of the
 * items and books the queue; `onSynced` reports what a sync booked.
 */
export function useOfflineCheckout(
  eventId: string | undefined,
  onSynced?: (result: SyncResult) => void
) {
  const client = useApiClient();
  const connected = useConnected();
  const available = isOfflineCheckoutAvailable();
  const disconnected = useDisconnected();
  const state = useSyncExternalStore(subscribe, () =>
    eventId ? (states.get(eventId) ?? EMPTY) : EMPTY
  );
  const refusedWith = useSyncExternalStore(subscribe, () =>
    eventId ? blocked.get(eventId) : undefined
  );
  const [refreshing, setRefreshing] = useState(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    if (available && eventId) void loadOfflineState(eventId);
  }, [available, eventId]);

  const sync = useCallback(async () => {
    if (!eventId) return;
    try {
      const result = await flushQueue(client, eventId);
      if (result.booked > 0) onSyncedRef.current?.(result);
    } catch {
      // Still no connection; the queue stays for the next try
    }
  }, [client, eventId]);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    setRefreshing(true);
    try {
      await sync();
      await downloadSnapshot(client, eventId);
    } catch {
      // Keeps the copy it has
    } finally {
      setRefreshing(false);
    }
  }, [client, eventId, sync]);

  // Back online (or opened online): book the queue, then take a fresh copy
  useEffect(() => {
    if (available && connected) void refresh();
  }, [available, connected, refresh]);

  // A sale queued while the socket was up (a request without reply) waits for no reconnect
  const pending = state.queue.length;
  useEffect(() => {
    if (!available || !connected || pending === 0 || refusedWith) return;
    const timer = setInterval(() => void sync(), RETRY_MS);
    return () => clearInterval(timer);
  }, [available, connected, pending, refusedWith, sync]);

  /** After a refusal of the whole sync: once more, e.g. after being added to the team again */
  const retry = useCallback(() => {
    if (!eventId) return;
    blocked.delete(eventId);
    emit();
    void sync();
  }, [eventId, sync]);

  return {
    available,
    /** Without connection; in the browser the desk cannot sell then */
    disconnected,
    /** Sells from the copy and queues the sales */
    offline: available && disconnected,
    snapshot: state.snapshot,
    pending,
    refusedWith,
    retry,
    refreshing,
    refresh,
    sync,
  };
}
