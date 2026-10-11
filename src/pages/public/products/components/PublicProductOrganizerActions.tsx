import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import type { Id, Doc } from '../../../../../convex/_generated/dataModel';
import { Button } from '../../../../components/ui/button';
import { ExternalLink, LayoutDashboard, Mail, Phone, User } from 'lucide-react';
import { InternalNoteEditor } from '../../../../components/products/InternalNoteEditor';
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

        {ep.vendor && (
          <div className="p-3 bg-muted rounded-lg text-sm space-y-1.5">
            <button
              type="button"
              onClick={() => navigate(`/events/view/${eventId}/products?vendor=${ep.vendor!._id}`)}
              className="flex items-start gap-2 text-left group"
            >
              <User className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span>
                <span className="block text-xs text-muted-foreground">Verkäufer</span>
                <span className="font-medium inline-flex items-center gap-1.5 group-hover:text-primary group-hover:underline">
                  {[ep.vendor.firstName, ep.vendor.lastName].filter(Boolean).join(' ') ||
                    ep.vendor.name ||
                    'Anonym'}
                  <ExternalLink className="h-3 w-3" />
                </span>
              </span>
            </button>
            {ep.vendor.phone && (
              <a
                href={`tel:${ep.vendor.phone}`}
                className="flex items-center gap-2 text-primary hover:underline w-fit"
              >
                <Phone className="h-4 w-4" />
                {ep.vendor.phone}
              </a>
            )}
            {(ep.vendor.email || ep.vendor.contactEmail) && (
              <a
                href={`mailto:${ep.vendor.email ?? ep.vendor.contactEmail}`}
                className="flex items-center gap-2 text-muted-foreground hover:underline w-fit"
              >
                <Mail className="h-4 w-4" />
                {ep.vendor.email ?? ep.vendor.contactEmail}
              </a>
            )}
          </div>
        )}

        <InternalNoteEditor eventProductId={ep._id} note={ep.internalNote} />

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
