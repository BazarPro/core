import type { Api } from './types';

/**
 * References to the backend functions, `api.events.get`. At runtime a reference only
 * carries its name ("events.get"); its types come from ./types.
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

export const api = reference([]) as Api;

/** "events.get" for `api.events.get`. */
export function getFunctionName(fn: unknown): string {
  const name = (fn as Record<symbol, unknown> | null)?.[NAME];
  if (typeof name !== 'string' || !name.includes('.')) {
    throw new Error('Not a function reference of api');
  }
  return name;
}
