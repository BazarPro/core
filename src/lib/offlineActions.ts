import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { ApiError, type ApiClient } from './api/client';
import { api } from './api/functions';
import { useApiClient, useConnected } from './api/react';
import type { FunctionArgs, Id } from './api/types';
import { deviceOwner, onDeviceOwnerChange, readDeviceJson, writeDeviceJson } from './deviceFiles';
import { getUserFacingErrorMessage } from './errors';
import {
  isNetworkError,
  isOfflineAvailable,
  isPermanentRefusal,
  useDisconnected,
} from './offlineMode';

/**
 * Intake without internet, in the app: accepting items (with location), the team note,
 * returns and accepting all items of a seller are queued on the device and replayed by
 * the backend once online (offline.replay), through the same functions with the same
 * checks. What it refuses then (the item was withdrawn, the seller paid out) shows in the
 * cash reconciliation. The known item list on the device shows the change right away.
 */

type StatusArgs = FunctionArgs<typeof api.eventProducts.updateProductStatus>;
type NoteArgs = FunctionArgs<typeof api.eventProducts.setEventProductNote>;
type VendorArgs = FunctionArgs<typeof api.eventProducts.markAllVendorProductsAvailable>;

export type IntakeAction =
  | { name: 'eventProducts.updateProductStatus'; args: StatusArgs }
  | { name: 'eventProducts.setEventProductNote'; args: NoteArgs }
  | { name: 'eventProducts.markAllVendorProductsAvailable'; args: VendorArgs };

export type QueuedAction = IntakeAction & {
  id: string;
  /** What the team saw, e.g. the item title; shown when the backend refuses it */
  label: string;
  doneAt: number;
};

const FUNCTIONS = {
  'eventProducts.updateProductStatus': api.eventProducts.updateProductStatus,
  'eventProducts.setEventProductNote': api.eventProducts.setEventProductNote,
  'eventProducts.markAllVendorProductsAvailable': api.eventProducts.markAllVendorProductsAvailable,
} as const;

/**
 * Actions per replay call; the backend takes at most 100 (MAX_ACTIONS). Smaller, so a
 * conflict with the running desk only repeats a few of them.
 */
const REPLAY_BATCH = 25;
/** While actions wait and the connection is up, replaying them is retried this often */
const RETRY_MS = 30_000;

// --- the queue per event, kept on the device

const queues = new Map<string, QueuedAction[]>();
/**
 * Why the backend refuses the whole replay, e.g. the user left the team: retrying will
 * not help, so it waits for the team (useOfflineIntake retry/discard).
 */
const blocked = new Map<string, string>();
const loading = new Map<string, Promise<QueuedAction[]>>();
const listeners = new Set<() => void>();
let writing: Promise<void> = Promise.resolve();
const NO_ACTIONS: QueuedAction[] = [];

const fileName = (eventId: string) => `offline-actions/${eventId}`;

/** Why the backend refuses the whole replay of the event; undefined while it may still pass. */
export function refusalOf(eventId: string): string | undefined {
  return blocked.get(eventId);
}

// Another user signed in: their queues, read again for the events shown
/** Counts the user changes: a read started before one is of the other user's file */
let owners = 0;
onDeviceOwnerChange(() => {
  owners += 1;
  const shown = [...queues.keys()];
  queues.clear();
  loading.clear();
  blocked.clear();
  emit();
  for (const eventId of shown) void loadQueue(eventId);
});

function emit() {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadQueue(eventId: string): Promise<QueuedAction[]> {
  const known = queues.get(eventId);
  if (known) return Promise.resolve(known);
  let pending = loading.get(eventId);
  if (!pending) {
    const reading = owners;
    pending = readDeviceJson<QueuedAction[]>(fileName(eventId)).then((stored) => {
      if (reading !== owners) return loadQueue(eventId);
      const current = queues.get(eventId) ?? (Array.isArray(stored) ? stored : []);
      queues.set(eventId, current);
      loading.delete(eventId);
      emit();
      return current;
    });
    loading.set(eventId, pending);
  }
  return pending;
}

async function update(eventId: string, change: (queue: QueuedAction[]) => QueuedAction[]) {
  // The user who did it: their file, also when another one signs in meanwhile
  const user = deviceOwner();
  await loadQueue(eventId);
  if (deviceOwner() !== user) {
    await serially(async () => {
      const stored = await readDeviceJson<QueuedAction[]>(fileName(eventId), user);
      await writeDeviceJson(fileName(eventId), change(Array.isArray(stored) ? stored : []), user);
    });
    return;
  }
  // The current queue, read after the await: another update may have run meanwhile
  const next = change(queues.get(eventId) ?? NO_ACTIONS);
  queues.set(eventId, next);
  emit();
  await serially(() => writeDeviceJson(fileName(eventId), next, user));
}

/** Writes one after the other, so a slow write cannot overwrite a newer one. */
function serially(write: () => Promise<void>): Promise<void> {
  const done = writing.then(write);
  writing = done.catch(() => undefined);
  return done;
}

/** Forgets the queues in memory; for tests. */
export function resetOfflineActions() {
  queues.clear();
  loading.clear();
  replaying.clear();
  blocked.clear();
}

// --- what the action changes in the known answers

type Changes = {
  status?: StatusArgs['status'];
  locationCategoryId?: Id<'eventLocationCategories'>;
  locationLabel?: string;
  internalNote?: string;
};

/**
 * Shows the action in the item list of the event and on the product pages
 * (getEventProduct) on the device.
 */
export function applyToKnownAnswers(client: ApiClient, eventId: string, action: IntakeAction) {
  const list = { eventId: eventId as Id<'events'> };
  const locations = client.answer(api.eventLocationCategories.listForEvent, list);
  /** What the action changes on one item of the event; null when it is not about it */
  const changesOf = (item: {
    eventProductId: string;
    vendorId?: string;
    status: string;
  }): Changes | null => {
    switch (action.name) {
      case 'eventProducts.updateProductStatus': {
        if (item.eventProductId !== action.args.eventProductId) return null;
        const location = action.args.locationCategoryId;
        return {
          status: action.args.status,
          ...(location
            ? {
                locationCategoryId: location,
                locationLabel: locations?.find((l) => l._id === location)?.label,
              }
            : {}),
        };
      }
      case 'eventProducts.setEventProductNote':
        return item.eventProductId === action.args.eventProductId
          ? { internalNote: action.args.note.trim() || undefined }
          : null;
      case 'eventProducts.markAllVendorProductsAvailable':
        return item.vendorId === action.args.vendorId && item.status === 'announced'
          ? { status: 'available' as const }
          : null;
    }
  };

  const changed: { productId: string; changes: Changes }[] = [];
  client.patchAnswer(api.eventProducts.getProductsForEventManagement, list, (products) =>
    products.map((product) => {
      const changes = changesOf(product);
      if (!changes) return product;
      changed.push({ productId: product._id, changes });
      return { ...product, ...changes };
    })
  );
  for (const { productId, changes } of changed) {
    client.patchAnswer(
      api.eventProducts.getEventProduct,
      { eventId: list.eventId, productId: productId as Id<'products'> },
      (details) => (details ? { ...details, ...changes } : details)
    );
  }
}

/**
 * A status change or note with what the device knows of the item, so the backend refuses
 * it when the item has moved on meanwhile (accepted and sold, or another note written on
 * another device) instead of setting it back. Accepting all items of a seller takes the
 * announced ones the device knows.
 */
function withSeenState(client: ApiClient, eventId: string, action: IntakeAction): IntakeAction {
  const products = client.answer(api.eventProducts.getProductsForEventManagement, {
    eventId: eventId as Id<'events'>,
  });
  if (action.name === 'eventProducts.markAllVendorProductsAvailable') {
    if (!products) return action;
    // Only what was there: items the seller announces meanwhile were not handed in
    const seenProductIds = products
      .filter((p) => p.vendorId === action.args.vendorId && p.status === 'announced')
      .map((p) => p._id);
    return { ...action, args: { ...action.args, seenProductIds } };
  }
  const known = products?.find((p) => p.eventProductId === action.args.eventProductId);
  if (!known) return action;
  return action.name === 'eventProducts.updateProductStatus'
    ? { ...action, args: { ...action.args, fromStatus: known.status } }
    : { ...action, args: { ...action.args, fromNote: known.internalNote ?? '' } };
}

/**
 * Does an intake action: online right away; offline, or when the backend does not
 * answer, in the app it goes into the queue. Errors of the backend are thrown as usual.
 * Returns whether it was queued.
 */
export async function runIntakeAction(
  client: ApiClient,
  eventId: string,
  action: IntakeAction,
  label: string,
  offline: boolean
): Promise<{ queued: boolean }> {
  const queue = async () => {
    // Before the known answers show the change
    const seen = withSeenState(client, eventId, action);
    await update(eventId, (current) => [
      ...current,
      { ...seen, id: crypto.randomUUID(), label, doneAt: Date.now() } as QueuedAction,
    ]);
    applyToKnownAnswers(client, eventId, action);
    return { queued: true };
  };
  if (offline && isOfflineAvailable()) return queue();
  try {
    await client.mutation(FUNCTIONS[action.name] as never, action.args as never);
    return { queued: false };
  } catch (error) {
    if (isOfflineAvailable() && !(error instanceof ApiError) && isNetworkError(error)) {
      return queue();
    }
    throw error;
  }
}

export type ReplayResult = { done: number; refused: number };

const replaying = new Map<string, Promise<ReplayResult>>();
/** Told what a replay did, whichever component started it */
const replayedListeners = new Set<(eventId: string, result: ReplayResult) => void>();

/** Replays the queue in batches; one run per event at a time. */
export function replayQueue(client: ApiClient, eventId: string): Promise<ReplayResult> {
  // A run already going: its result counts once, for whoever started it
  const running = replaying.get(eventId);
  if (running) return running.then(() => ({ done: 0, refused: 0 }));
  const run = (async () => {
    const result: ReplayResult = { done: 0, refused: 0 };
    for (;;) {
      const batch = (await loadQueue(eventId)).slice(0, REPLAY_BATCH);
      if (batch.length === 0) return result;
      const replayed = await client.mutation(api.offline.replay, {
        eventId: eventId as Id<'events'>,
        actions: batch.map(({ id, name, args, label, doneAt }) => ({
          id,
          name,
          args,
          label,
          doneAt,
        })),
      });
      const done = new Set(replayed.map((action) => action.id));
      for (const action of replayed) {
        if (!action.doneNow) continue;
        if (action.error) result.refused += 1;
        else result.done += 1;
      }
      await update(eventId, (queue) => queue.filter((action) => !done.has(action.id)));
      if (done.size === 0) return result;
    }
  })()
    .then((result) => {
      if (blocked.delete(eventId)) emit();
      if (result.done + result.refused > 0) {
        for (const listener of [...replayedListeners]) listener(eventId, result);
      }
      return result;
    })
    .catch((error: unknown) => {
      if (isPermanentRefusal(error)) {
        blocked.set(eventId, getUserFacingErrorMessage(error));
        emit();
      }
      throw error;
    })
    .finally(() => replaying.delete(eventId));
  replaying.set(eventId, run);
  return run;
}

/**
 * The intake queue of an event: replayed once online and retried while actions wait.
 * `run` does an action online or queues it; `onReplayed` hears of every replay of the
 * event, also one another component started.
 */
export function useOfflineIntake(
  eventId: string | undefined,
  onReplayed?: (result: ReplayResult) => void
) {
  const client = useApiClient();
  const connected = useConnected();
  const disconnected = useDisconnected();
  const available = isOfflineAvailable();
  const queue = useSyncExternalStore(subscribe, () =>
    eventId ? (queues.get(eventId) ?? NO_ACTIONS) : NO_ACTIONS
  );
  const refusedWith = useSyncExternalStore(subscribe, () =>
    eventId ? refusalOf(eventId) : undefined
  );
  const onReplayedRef = useRef(onReplayed);
  onReplayedRef.current = onReplayed;

  useEffect(() => {
    if (available && eventId) void loadQueue(eventId);
  }, [available, eventId]);

  useEffect(() => {
    if (!eventId) return;
    const listener = (replayed: string, result: ReplayResult) => {
      if (replayed === eventId) onReplayedRef.current?.(result);
    };
    replayedListeners.add(listener);
    return () => void replayedListeners.delete(listener);
  }, [eventId]);

  const replay = useCallback(async () => {
    if (!eventId) return;
    try {
      await replayQueue(client, eventId);
    } catch {
      // Still no connection; the queue stays
    }
  }, [client, eventId]);

  const pending = queue.length;
  const waiting = available && connected && pending > 0 && !refusedWith;
  useEffect(() => {
    if (waiting) void replay();
  }, [waiting, pending, replay]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void replay(), RETRY_MS);
    return () => clearInterval(timer);
  }, [waiting, replay]);

  /** After a refusal of the whole replay: once more, e.g. after being added to the team again */
  const retry = useCallback(() => {
    if (!eventId) return;
    blocked.delete(eventId);
    emit();
    void replay();
  }, [eventId, replay]);

  /** Drops the queue on this device, after a refusal the team cannot settle otherwise */
  const discard = useCallback(async () => {
    if (!eventId) return;
    blocked.delete(eventId);
    await update(eventId, () => []);
  }, [eventId]);

  const run = useCallback(
    (action: IntakeAction, label: string) => {
      if (!eventId) throw new Error('Missing event');
      return runIntakeAction(client, eventId, action, label, available && disconnected);
    },
    [available, client, disconnected, eventId]
  );

  return { pending, refusedWith, retry, discard, run, offline: available && disconnected };
}
