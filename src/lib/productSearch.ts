/**
 * Search on the product management page: a seller number ("17", "Nr. 17", "#17")
 * finds that seller's items exactly, anything else is matched as text in title,
 * id, internal note and seller name.
 */

/** The seller number the search term stands for, or null. */
export function parseSellerNumber(term: string): number | null {
  const match = /^(?:nr\.?|#)?\s*(\d+)$/i.exec(term.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return number > 0 ? number : null;
}

export interface SearchableProduct {
  _id: string;
  title: string;
  vendorId: string;
  internalNote?: string;
}

export interface SearchableVendor {
  name?: string;
  email?: string;
  sellerNumber?: number;
}

/** Prepares a term once, so filtering thousands of items stays cheap. */
export function productMatcher(
  term: string,
  vendorById: Map<string, SearchableVendor>
): (product: SearchableProduct) => boolean {
  const lower = term.trim().toLowerCase();
  if (!lower) return () => true;
  const number = parseSellerNumber(lower);
  const textMatch = (product: SearchableProduct) =>
    product.title.toLowerCase().includes(lower) ||
    product._id.toLowerCase().includes(lower) ||
    !!product.internalNote?.toLowerCase().includes(lower);
  if (number !== null) {
    // A number is a seller number, not part of a name: "1" must not find seller 17
    return (product) =>
      vendorById.get(product.vendorId)?.sellerNumber === number || textMatch(product);
  }
  return (product) =>
    textMatch(product) || !!vendorById.get(product.vendorId)?.name?.toLowerCase().includes(lower);
}

/** Sellers for the suggestions: the one with the number first, then names and emails. */
export function matchingVendors<V extends SearchableVendor>(
  term: string,
  vendors: V[],
  limit = 5
): V[] {
  const lower = term.trim().toLowerCase();
  if (!lower) return [];
  const number = parseSellerNumber(lower);
  const byNumber = number === null ? [] : vendors.filter((v) => v.sellerNumber === number);
  const byText = vendors.filter(
    (v) =>
      !byNumber.includes(v) &&
      (v.name?.toLowerCase().includes(lower) || v.email?.toLowerCase().includes(lower))
  );
  return [...byNumber, ...byText].slice(0, limit);
}
