import { ConvexError } from 'convex/values';
import i18n from '../i18n';
import { appErrorData, type AppErrorData } from '../../convex/errors';

interface UserFacingErrorOptions {
  fallback?: string;
  messageMap?: Record<string, string>;
}

function extractRawErrorMessage(error: unknown): string {
  // ConvexError payloads survive production error redaction, plain Error messages do not
  if (error instanceof ConvexError && typeof error.data === 'string') {
    return error.data;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? '');
}

export function extractConvexErrorMessage(error: unknown): string {
  const raw = extractRawErrorMessage(error);

  // Convex server error wrapper and stack details:
  // [CONVEX ...] [Request ID: ...] Server Error Uncaught Error: <message> at handler (...) Called by client
  return raw
    .replace(/^\[CONVEX[^\]]*]\s*/i, '')
    .replace(/^\[Request ID:[^\]]*]\s*/i, '')
    .replace(/^Server Error\s*/i, '')
    .replace(/^Uncaught Error:\s*/i, '')
    .replace(/\s+at handler[\s\S]*$/i, '')
    .replace(/\s+Called by client[\s\S]*$/i, '')
    .trim();
}

/** Text of a backend error code in the current language of the app. */
export function translateAppError(data: Pick<AppErrorData, 'code' | 'params' | 'cause'>): string {
  const text = i18n.t(data.code as never, { ns: 'errors', ...data.params }) as string;
  return data.cause ? `${text} ${translateAppError(data.cause)}` : text;
}

export function getUserFacingErrorMessage(
  error: unknown,
  options: UserFacingErrorOptions = {}
): string {
  const fallback = options.fallback ?? i18n.t('unknownError');
  // Errors from appError() carry a code, the app has the text in every language
  const data = appErrorData(error);
  if (data) return translateAppError(data);
  const parsed = extractConvexErrorMessage(error);

  if (!parsed) {
    return fallback;
  }

  if (options.messageMap && options.messageMap[parsed]) {
    return options.messageMap[parsed];
  }

  return parsed;
}
