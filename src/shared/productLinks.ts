// Shared by the app and the web server (server/index.ts).
const SHORT_PRODUCT_LINK = /^\/p\/([0-9a-z-]+)\/?$/i;

/**
 * Product page for the short link on printed labels (`/P/<UUID>`, src/lib/labelQr.ts),
 * or null. The id is in upper case there; UUIDs are lower case everywhere else.
 */
export function shortProductLinkTarget(pathname: string): string | null {
  const id = pathname.match(SHORT_PRODUCT_LINK)?.[1];
  return id ? `/products/view/${id.toLowerCase()}` : null;
}
