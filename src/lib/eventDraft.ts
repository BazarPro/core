/**
 * A bazaar set up in the creation wizard before signing up. It waits in this browser
 * until the account exists; the wizard then creates it (src/pages/organizer/events/
 * EditEventForm.tsx). Pictures are not kept: they are added once the bazaar exists.
 */

const KEY = 'bazarpro.eventDraft';
const MAX_AGE_MS = 14 * 24 * 3600 * 1000;

/** Where the wizard creates the waiting draft after sign-up. */
export const CREATE_DRAFT_PATH = '/events/new?draft=1';

export interface EventDraft<Values> {
  values: Values;
  pendingLocationCategories: string[];
  eventType?: string;
  /** The wizard step to come back to; drafts without one go to the last step */
  step?: number;
  /** The same step by name (`basics`, `fees`, ...): numbers change when steps are merged */
  stepId?: string;
  /** The guest finished the wizard: only then the sign-up creates the bazaar by itself */
  submitted?: boolean;
  /** The draft on the server it continues (its updatedAt), so saving it again asks nothing */
  continues?: number;
  savedAt: number;
}

/** Empty number fields hold NaN, which JSON would turn into null: leave them out */
const leaveOutNaN = (_key: string, value: unknown) =>
  typeof value === 'number' && Number.isNaN(value) ? undefined : value;

/** The values as JSON keeps them, for the draft on the server: without empty numbers. */
export function draftJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, leaveOutNaN)) as T;
}

/**
 * A stored draft as the form takes it: drafts saved before empty numbers were left out
 * hold null there, which no field accepts (e.g. the fees of a fee group).
 */
export function withoutNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutNulls) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== null)
        .map(([key, entry]) => [key, withoutNulls(entry)])
    ) as T;
  }
  return value;
}

export function saveEventDraft<Values>(draft: Omit<EventDraft<Values>, 'savedAt'>) {
  try {
    const json = JSON.stringify({ ...draft, savedAt: Date.now() }, leaveOutNaN);
    localStorage.setItem(KEY, json);
  } catch {
    // Private mode or full storage: the draft is only lost on the way to the account
  }
}

export function loadEventDraft<Values>(now = Date.now()): EventDraft<Values> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as EventDraft<Values>;
    if (!draft?.values || typeof draft.savedAt !== 'number' || now - draft.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

/** The title typed so far, if any; server drafts are stored as the wizard left them. */
export function eventDraftTitle(draft: unknown): string | undefined {
  const title = (draft as { values?: { title?: unknown } } | null)?.values?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : undefined;
}

export function clearEventDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
