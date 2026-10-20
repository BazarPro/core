import { ConvexError } from 'convex/values';
import deErrors from '../src/locales/de/errors.json';

/**
 * Errors users see. The backend sends a code with its values; the app shows the text
 * for the code in its current language (src/locales/<language>/errors.json). `message`
 * is the German text, for logs and for clients that do not know the code yet.
 */

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type ErrorCode = Leaves<typeof deErrors>;
export type ErrorParams = Record<string, string | number>;

export type AppErrorData = {
  code: ErrorCode;
  params?: ErrorParams;
  message: string;
  /** The error of one item when a whole cart fails */
  cause?: { code: ErrorCode; params?: ErrorParams };
};

function germanText(code: ErrorCode, params?: ErrorParams): string {
  let node: unknown = deErrors;
  for (const part of code.split('.')) node = (node as Record<string, unknown>)[part];
  return String(node).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ''));
}

export function appError(
  code: ErrorCode,
  params?: ErrorParams,
  cause?: AppErrorData
): ConvexError<AppErrorData> {
  const message = cause ? `${germanText(code, params)} ${cause.message}` : germanText(code, params);
  return new ConvexError({
    code,
    ...(params ? { params } : {}),
    message,
    ...(cause
      ? { cause: { code: cause.code, ...(cause.params ? { params: cause.params } : {}) } }
      : {}),
  });
}

/** The data of an error thrown by appError, else null. */
export function appErrorData(error: unknown): AppErrorData | null {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as Partial<AppErrorData> | null;
  return data && typeof data === 'object' && typeof data.code === 'string'
    ? (data as AppErrorData)
    : null;
}
