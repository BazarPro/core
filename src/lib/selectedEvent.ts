import { useSyncExternalStore } from 'react';

/**
 * The event an organizer works on: chosen in the overview or by opening an event page,
 * shown big in the overview and with its pages in the sidebar. Without a choice the
 * most current event counts (`currentEvent`).
 */
const STORAGE_KEY = 'bazarpro.selectedEvent';
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let remembered = read();

export function selectEvent(eventId: string) {
  if (remembered === eventId) return;
  try {
    localStorage.setItem(STORAGE_KEY, eventId);
  } catch {
    // Private mode: the choice lasts until the page is left
  }
  remembered = eventId;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSelectedEventId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => remembered,
    () => null
  );
}

type Dated = { _id: string; startDate: number; endDate: number };

/** The running event, else the next one, else the last one that ended. */
export function currentEvent<T extends Dated>(events: T[], now = Date.now()): T | undefined {
  const running = events.filter((e) => e.startDate <= now && e.endDate >= now);
  if (running.length > 0) return running.sort((a, b) => a.startDate - b.startDate)[0];
  const upcoming = events
    .filter((e) => e.startDate > now)
    .sort((a, b) => a.startDate - b.startDate);
  if (upcoming.length > 0) return upcoming[0];
  return [...events].sort((a, b) => b.endDate - a.endDate)[0];
}

/** The chosen event if it is still one of `events`, else the most current one. */
export function selectedOrCurrent<T extends Dated>(events: T[], selectedId: string | null) {
  return events.find((event) => event._id === selectedId) ?? currentEvent(events);
}

/** Only for tests: forget the choice. */
export function resetSelectedEvent() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing stored
  }
  remembered = null;
  for (const listener of [...listeners]) listener();
}
