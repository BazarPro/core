import i18n from '../i18n';
import { ApiError, type ApiErrorData } from './api/client';
import { isNetworkError } from './offlineMode';

interface UserFacingErrorOptions {
  fallback?: string;
  messageMap?: Record<string, string>;
}

/** The code of a backend error, e.g. "INVALID_CREDENTIALS", else null. */
export function apiErrorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}

/** The text of an error: the code's text where the app has none, else the message. */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.data.message;
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

/** The data of a backend error whose code has a text in errors.json, else null. */
export function appErrorData(error: unknown): ApiErrorData | null {
  if (!(error instanceof ApiError)) return null;
  return i18n.exists(error.code, { ns: 'errors' }) ? error.data : null;
}

/** Text of a backend error code in the current language of the app. */
export function translateAppError(data: Pick<ApiErrorData, 'code' | 'params' | 'cause'>): string {
  const text = i18n.t(data.code as never, { ns: 'errors', ...data.params }) as string;
  return data.cause ? `${text} ${translateAppError(data.cause)}` : text;
}

export function getUserFacingErrorMessage(
  error: unknown,
  options: UserFacingErrorOptions = {}
): string {
  const fallback = options.fallback ?? i18n.t('unknownError');
  // Errors with a code: the app has the text in every language
  const data = appErrorData(error);
  if (data) return translateAppError(data);
  const code = apiErrorCode(error);
  if (code && options.messageMap?.[code]) return options.messageMap[code];
  if (isNetworkError(error)) return i18n.t('offlineError');

  const parsed = extractErrorMessage(error).trim();
  if (!parsed) {
    return fallback;
  }
  if (options.messageMap && options.messageMap[parsed]) {
    return options.messageMap[parsed];
  }
  return parsed;
}
