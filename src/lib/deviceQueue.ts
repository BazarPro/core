import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ApiClient } from './api/client';
import { deviceOwner, onDeviceOwnerChange, readDeviceJson, writeDeviceJson } from './deviceFiles';
import { getUserFacingErrorMessage } from './errors';
import { isPermanentRefusal } from './offlineMode';

/**
 * A queue per event, kept in a file on the device of the signed-in user and sent to the
 * backend in batches once online. The cash desk (offlineCheckout) and the intake
 * (offlineActions) build on it; each only says how its state is stored and how a batch
 * is sent.
 */

/** While items wait and the connection is up, sending them is retried this often */
export const RETRY_MS = 30_000;

export type DeviceQueueOptions<State, Item, Result> = {
  /** File of an event, e.g. `offline-checkout/<id>` */
  file: (eventId: string) => string;
  /** The state without a file; also what a component sees before it is read */
  empty: State;
  /** The state from what the file holds; `null` when there is none */
  parse: (stored: unknown) => State;
  queueOf: (state: State) => Item[];
  withQueue: (state: State, queue: Item[]) => State;
  /** Items per call to the backend */
  batch: number;
  /** A fresh result before a run; also what a caller gets that joined a running one */
  emptyResult: () => Result;
  /**
   * Sends a batch and counts what the backend did now into `result`. Returns the IDs it
   * answered for; they leave the queue. Throws on a network error or refusal.
   */
  send: (client: ApiClient, eventId: string, batch: Item[], result: Result) => Promise<Set<string>>;
  idOf: (item: Item) => string;
};

export function createDeviceQueue<State, Item, Result>(
  options: DeviceQueueOptions<State, Item, Result>
) {
  const { file, empty, parse, queueOf, withQueue } = options;

  const states = new Map<string, State>();
  /**
   * Why the backend refuses the whole queue, e.g. the user left the team: retrying will
   * not help, so it waits for the team (retry, or discard). Items are never dropped.
   */
  const blocked = new Map<string, string>();
  const loading = new Map<string, Promise<State>>();
  const flushing = new Map<string, Promise<Result>>();
  const listeners = new Set<() => void>();
  /** Writes one after the other, so a slow write cannot overwrite a newer one */
  let writing: Promise<void> = Promise.resolve();

  const readStored = async (eventId: string, user = deviceOwner()) =>
    parse(await readDeviceJson<unknown>(file(eventId), user));

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
    for (const eventId of shown) void load(eventId);
  });

  function emit() {
    for (const listener of [...listeners]) listener();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }

  function load(eventId: string): Promise<State> {
    const known = states.get(eventId);
    if (known) return Promise.resolve(known);
    let pending = loading.get(eventId);
    if (!pending) {
      const reading = owners;
      pending = readStored(eventId).then((stored) => {
        if (reading !== owners) return load(eventId);
        // A change made while reading wins over what was stored
        const current = states.get(eventId) ?? stored;
        states.set(eventId, current);
        loading.delete(eventId);
        emit();
        return current;
      });
      loading.set(eventId, pending);
    }
    return pending;
  }

  function serially(write: () => Promise<void>): Promise<void> {
    const done = writing.then(write);
    writing = done.catch(() => undefined);
    return done;
  }

  /** Resolves once the change is on the device, e.g. before the cart is emptied. */
  async function update(eventId: string, change: (state: State) => State): Promise<void> {
    // The user who did it: their file, also when another one signs in meanwhile
    const user = deviceOwner();
    await load(eventId);
    if (deviceOwner() !== user) {
      await serially(async () =>
        writeDeviceJson(file(eventId), change(await readStored(eventId, user)), user)
      );
      return;
    }
    // The current state, read after the await: another update may have run meanwhile
    const next = change(states.get(eventId) ?? empty);
    states.set(eventId, next);
    emit();
    await serially(() => writeDeviceJson(file(eventId), next, user));
  }

  /**
   * Sends the queue in batches. An item leaves the queue once the backend answered for
   * it; on a network error the rest stays for the next try. One run per event at a time.
   */
  function flush(client: ApiClient, eventId: string): Promise<Result> {
    // A run already going: its result counts once, for whoever started it
    const running = flushing.get(eventId);
    if (running) return running.then(() => options.emptyResult());
    const run = (async () => {
      const result = options.emptyResult();
      for (;;) {
        const batch = queueOf(await load(eventId)).slice(0, options.batch);
        if (batch.length === 0) return result;
        const done = await options.send(client, eventId, batch, result);
        await update(eventId, (state) =>
          withQueue(
            state,
            queueOf(state).filter((item) => !done.has(options.idOf(item)))
          )
        );
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
      .finally(() => flushing.delete(eventId));
    flushing.set(eventId, run);
    return run;
  }

  /** Why the backend refuses the whole queue of the event; undefined while it may pass. */
  function refusalOf(eventId: string): string | undefined {
    return blocked.get(eventId);
  }

  /** Forgets the refusal, before trying once more or dropping the queue. */
  function clearRefusal(eventId: string) {
    if (blocked.delete(eventId)) emit();
  }

  /**
   * Drops the queue on this device, after a refusal the team cannot settle otherwise. The
   * refusal goes with it in one change, so the queue is not sent once more meanwhile.
   */
  async function discard(eventId: string): Promise<void> {
    blocked.delete(eventId);
    await update(eventId, (state) => withQueue(state, []));
  }

  /** Forgets the state in memory; for tests. */
  function reset() {
    states.clear();
    loading.clear();
    flushing.clear();
    blocked.clear();
  }

  /** The state of the event and the refusal, for components. */
  function useQueueState(eventId: string | undefined) {
    const state = useSyncExternalStore(subscribe, () =>
      eventId ? (states.get(eventId) ?? empty) : empty
    );
    const refusedWith = useSyncExternalStore(subscribe, () =>
      eventId ? blocked.get(eventId) : undefined
    );
    return { state, refusedWith };
  }

  return { load, update, flush, refusalOf, clearRefusal, discard, reset, useQueueState };
}

/**
 * Sends a waiting queue at once when online, e.g. an item queued while the socket was up
 * (a request without reply), and retries while it waits. `retry` tries once more after a
 * refusal of the whole queue, e.g. after being added to the team again.
 */
export function useSendWhileWaiting({
  waiting,
  pending,
  send,
  clearRefusal,
}: {
  waiting: boolean;
  pending: number;
  send: () => Promise<void>;
  clearRefusal: () => void;
}) {
  useEffect(() => {
    if (waiting) void send();
  }, [waiting, pending, send]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void send(), RETRY_MS);
    return () => clearInterval(timer);
  }, [waiting, send]);

  return useCallback(() => {
    clearRefusal();
    void send();
  }, [clearRefusal, send]);
}
