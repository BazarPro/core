/** Product id from a scanned label (URL of the product page) or a typed id. */
export function productIdFromCode(code: string): string | null {
  const value = code.trim();
  const match = value.match(/\/products\/view\/([a-z0-9]+)/i);
  if (match) return match[1];
  return /^[a-z0-9]{16,}$/i.test(value) ? value : null;
}
