/**
 * The cash desk in full screen: no header, menu or tab bar, only the desk itself, for a
 * tablet or laptop at the bazaar (`/events/view/:eventId/checkout/fullscreen`).
 */
export function isFullscreenDesk(path: string): boolean {
  return /^\/events\/view\/[^/]+\/checkout\/fullscreen\/?$/.test(path);
}
