interface UserFacingErrorOptions {
  fallback?: string;
  messageMap?: Record<string, string>;
}

function extractRawErrorMessage(error: unknown): string {
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

export function getUserFacingErrorMessage(
  error: unknown,
  options: UserFacingErrorOptions = {}
): string {
  const fallback = options.fallback ?? 'Ein unbekannter Fehler ist aufgetreten.';
  const parsed = extractConvexErrorMessage(error);

  if (!parsed) {
    return fallback;
  }

  if (options.messageMap && options.messageMap[parsed]) {
    return options.messageMap[parsed];
  }

  return parsed;
}
