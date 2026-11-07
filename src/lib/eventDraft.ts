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
  /** The guest finished the wizard: only then the sign-up creates the bazaar by itself */
  submitted?: boolean;
  savedAt: number;
}

export function saveEventDraft<Values>(draft: Omit<EventDraft<Values>, 'savedAt'>) {
  try {
    // Empty number fields hold NaN, which JSON would turn into null: leave them out
    const json = JSON.stringify({ ...draft, savedAt: Date.now() }, (_key, value: unknown) =>
      typeof value === 'number' && Number.isNaN(value) ? undefined : value
    );
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
