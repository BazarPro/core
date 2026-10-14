/** Seller number of the event, e.g. "Nr. 17"; nothing for sellers without one yet. */
export function SellerNumberBadge({ number }: { number?: number }) {
  if (number === undefined) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground"
      title="Verkäufernummer"
    >
      Nr. {number}
    </span>
  );
}
