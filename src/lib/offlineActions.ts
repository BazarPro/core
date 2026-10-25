import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { ApiError, type ApiClient } from './api/client';
import { api } from './api/functions';
import { useApiClient, useConnected } from './api/react';
import type { FunctionArgs, Id } from './api/types';
import { readDeviceJson, writeDeviceJson } from './deviceFiles';
import { isNetworkError, isOfflineAvailable, useDisconnected } from './offlineMode';

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
const loading = new Map<string, Promise<QueuedAction[]>>();
const listeners = new Set<() => void>();
let writing: Promise<void> = Promise.resolve();
const NO_ACTIONS: QueuedAction[] = [];

const fileName = (eventId: string) => `offline-actions/${eventId}`;

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
    pending = readDeviceJson<QueuedAction[]>(fileName(eventId)).then((stored) => {
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
  const next = change(await loadQueue(eventId));
  queues.set(eventId, next);
  emit();
  const write = writing.then(() => writeDeviceJson(fileName(eventId), next));
  writing = write.catch(() => undefined);
  await write;
}

/** Forgets the queues in memory; for tests. */
export function resetOfflineActions() {
  queues.clear();
  loading.clear();
  replaying.clear();
}

// --- what the action changes in the known answers

/** Shows the action in the item list of the event on the device. */
export function applyToKnownAnswers(client: ApiClient, eventId: string, action: IntakeAction) {
  const list = { eventId: eventId as Id<'events'> };
  const locations = client.answer(api.eventLocationCategories.listForEvent, list);
  client.patchAnswer(api.eventProducts.getProductsForEventManagement, list, (products) =>
    products.map((product) => {
      switch (action.name) {
        case 'eventProducts.updateProductStatus': {
          if (product.eventProductId !== action.args.eventProductId) return product;
          const location = action.args.locationCategoryId;
          return {
            ...product,
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
          return product.eventProductId === action.args.eventProductId
            ? { ...product, internalNote: action.args.note.trim() || undefined }
            : product;
        case 'eventProducts.markAllVendorProductsAvailable':
          return product.vendorId === action.args.vendorId && product.status === 'announced'
            ? { ...product, status: 'available' as const }
            : product;
      }
    })
  );
}

/**
 * A status change with the status the device knows, so the backend refuses it when the
 * item has moved on meanwhile (accepted and sold on another device) instead of setting it
 * back.
 */
function withSeenStatus(client: ApiClient, eventId: string, action: IntakeAction): IntakeAction {
  if (action.name !== 'eventProducts.updateProductStatus') return action;
  const products = client.answer(api.eventProducts.getProductsForEventManagement, {
    eventId: eventId as Id<'events'>,
  });
  const known = products?.find((p) => p.eventProductId === action.args.eventProductId);
  return known ? { ...action, args: { ...action.args, fromStatus: known.status } } : action;
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
    const seen = withSeenStatus(client, eventId, action);
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
      if (result.done + result.refused > 0) {
        for (const listener of [...replayedListeners]) listener(eventId, result);
      }
      return result;
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
  useEffect(() => {
    if (available && connected && pending > 0) void replay();
  }, [available, connected, pending, replay]);

  useEffect(() => {
    if (!available || !connected || pending === 0) return;
    const timer = setInterval(() => void replay(), RETRY_MS);
    return () => clearInterval(timer);
  }, [available, connected, pending, replay]);

  const run = useCallback(
    (action: IntakeAction, label: string) => {
      if (!eventId) throw new Error('Missing event');
      return runIntakeAction(client, eventId, action, label, available && disconnected);
    },
    [available, client, disconnected, eventId]
  );

  return { pending, run, offline: available && disconnected };
}
