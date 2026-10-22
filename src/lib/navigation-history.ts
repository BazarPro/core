const STORAGE_KEY_GLOBAL = 'navHistory.global';
const STORAGE_KEY_ROLE: Record<'organizer' | 'participant' | 'administrator', string> = {
  organizer: 'navHistory.role.organizer',
  participant: 'navHistory.role.participant',
  administrator: 'navHistory.role.administrator',
};
const MAX_ENTRIES = 50;

export function getCurrentPath(
  location: Location | { pathname: string; search?: string; hash?: string }
) {
  const search = 'search' in location && location.search ? location.search : '';
  const hash = 'hash' in location && location.hash ? location.hash : '';
  return `${location.pathname}${search}${hash}`;
}

export function readHistory(storageKey: string): string[] {
  if (typeof window === 'undefined') return [];
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writeHistory(storageKey: string, entries: string[]) {
  if (typeof window === 'undefined') return;
  const sliced = entries.slice(-MAX_ENTRIES);
  sessionStorage.setItem(storageKey, JSON.stringify(sliced));
}

/**
 * A page seen before cuts the history back to it instead of adding it again: going back
 * and forth between an event and its items must not make "back" retrace every step.
 */
export function visit(history: string[], path: string): string[] {
  const seen = history.lastIndexOf(path);
  return seen >= 0 ? history.slice(0, seen + 1) : [...history, path];
}

export function pushHistory(
  path: string,
  role?: 'organizer' | 'participant' | 'administrator' | null
) {
  writeHistory(STORAGE_KEY_GLOBAL, visit(readHistory(STORAGE_KEY_GLOBAL), path));
  if (!role) return;
  writeHistory(STORAGE_KEY_ROLE[role], visit(readHistory(STORAGE_KEY_ROLE[role]), path));
}

export function popToPrevious(
  currentPath: string,
  role?: 'organizer' | 'participant' | 'administrator' | null
): string | null {
  const primaryKey = role ? STORAGE_KEY_ROLE[role] : STORAGE_KEY_GLOBAL;
  const history = readHistory(primaryKey);
  const prev = popFromHistory(history, currentPath);
  if (prev) {
    writeHistory(primaryKey, history);
    return prev;
  }

  if (role) {
    const globalHistory = readHistory(STORAGE_KEY_GLOBAL);
    const globalPrev = popFromHistory(globalHistory, currentPath);
    if (globalPrev) {
      writeHistory(STORAGE_KEY_GLOBAL, globalHistory);
      return globalPrev;
    }
  }

  return null;
}

function popFromHistory(history: string[], currentPath: string): string | null {
  if (history.length === 0) return null;

  const last = history[history.length - 1];
  if (last === currentPath) {
    const prev = history[history.length - 2] ?? null;
    if (prev) {
      history.splice(history.length - 1, 1);
    }
    return prev;
  }

  const idx = history.lastIndexOf(currentPath);
  if (idx > 0) {
    const prev = history[idx - 1];
    history.splice(idx);
    return prev;
  }

  return history[history.length - 1] ?? null;
}
