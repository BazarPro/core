import { Receipt } from 'lucide-react';
import { describeSellerFees, type SellerFees } from '../../lib/sellerFees';

/** The fees of a bazaar for sellers, before they register and on the bazaar page. */
export function SellerFeesInfo({ fees, className }: { fees: SellerFees; className?: string }) {
  const { lines, example } = describeSellerFees(fees);
  return (
    <div className={className}>
      <p className="mb-2 flex items-center gap-2 font-medium">
        <Receipt className="h-4 w-4 text-muted-foreground" /> Gebühren für Verkäufer
      </p>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Gebühren: Du bekommst den vollen Verkaufspreis.
        </p>
      ) : (
        <>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{example}</p>
        </>
      )}
    </div>
  );
}
