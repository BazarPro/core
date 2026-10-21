import type { api as backendApi } from '../../../convex/_generated/api';

/**
 * References to the backend functions, `api.events.get` like convex/_generated/api. At
 * runtime a reference only carries its name ("events.get"); the types still come from the
 * function definitions in convex/.
 */

const NAME = Symbol.for('bazarpro.functionName');

function reference(path: string[]): unknown {
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === NAME) return path.join('.');
        // Not a function name: promise checks, React dev tools, console.log
        if (typeof prop !== 'string' || prop === 'then' || prop === 'toJSON') return undefined;
        return reference([...path, prop]);
      },
    }
  );
}

export const api = reference([]) as typeof backendApi;

/** "events.get" for `api.events.get`. */
export function getFunctionName(fn: unknown): string {
  const name = (fn as Record<symbol, unknown> | null)?.[NAME];
  if (typeof name !== 'string' || !name.includes('.')) {
    throw new Error('Not a function reference of api');
  }
  return name;
}
