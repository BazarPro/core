/** Pages that make no sense to return to after logging in. */
const AUTH_PATHS = ['/login', '/register'];

/**
 * Only same-site paths are allowed as targets, so a crafted link cannot send
 * the user to another site after login.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  const pathname = value.split(/[?#]/)[0];
  if (AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return null;
  }
  return value;
}

/** Login URL that brings the user back to `returnTo` afterwards. */
export function loginPath(returnTo?: string): string {
  const target = safeRedirectPath(returnTo);
  if (!target || target === '/') return '/login';
  return `/login?redirect=${encodeURIComponent(target)}`;
}
