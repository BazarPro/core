import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id, Doc } from '../../../../../convex/_generated/dataModel';
import { Button } from '../../../../components/ui/button';
import { LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getEventProductStatusTitle } from '../../../../lib/eventProductStatus';

interface PublicProductOrganizerActionsProps {
  productId: Id<'products'>;
  eventId: Id<'events'>;
}

type EventProductWithDetails = Doc<'eventProducts'> & {
  product: Doc<'products'>;
  vendor: Doc<'users'> | null;
  discountPercent?: number;
};

export function PublicProductOrganizerActions({
  productId,
  eventId,
}: PublicProductOrganizerActionsProps) {
  const navigate = useNavigate();

  const myRoles = useQuery(api.eventRoles.getMyRolesForEvent, { eventId }) ?? [];
  const canManage = myRoles.includes('organizer') || myRoles.includes('coorganizer');

  const ep = useQuery(
    api.eventProducts.getEventProduct,
    canManage ? { eventId, productId } : 'skip'
  ) as EventProductWithDetails | null | undefined;

  if (!canManage || !ep) return null;

  return (
    <div className="bg-card border-2 border-primary/20 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        <h3 className="font-bold text-lg">Veranstalter-Verwaltung</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">Status beim Event:</span>
          <Badge
            variant={
              ep.status === 'available' ? 'default' : ep.status === 'sold' ? 'secondary' : 'outline'
            }
          >
            {getEventProductStatusTitle(ep.status)}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Button
            className="w-full gap-2 h-12"
            onClick={() => navigate(`/events/view/${eventId}/products?q=${productId}&tab=all`)}
          >
            <LayoutDashboard className="h-5 w-5" />
            Im Produkt-Management öffnen
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center italic">
          Klicke oben, um die Annahme, den Verkauf oder die Rückgabe dieses Artikels abzuwickeln.
        </p>
      </div>
    </div>
  );
}

function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline';
}) {
  const variants = {
    default: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
