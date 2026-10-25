import type { ReactNode } from 'react';
import { useQuery } from '../../../../lib/api/react';
import { api } from '../../../../lib/api/functions';
import type { Id, Doc } from '../../../../lib/api/types';
import { Button } from '../../../../components/ui/button';
import { ClipboardList, ExternalLink, LayoutDashboard, Mail, Phone, User } from 'lucide-react';
import { Badge } from '../../../../components/ui/badge';
import { InternalNoteEditor } from '../../../../components/products/InternalNoteEditor';
import { useNavigate } from 'react-router-dom';
import { getEventProductStatusTitle } from '../../../../lib/eventProductStatus';
import { ProductRolePanel } from './ProductRolePanel';
import { WalkInBadge } from '../../../../components/walkIn/WalkInBadge';
import { useTranslation } from 'react-i18next';

interface PublicProductOrganizerActionsProps {
  productId: Id<'products'>;
  eventId: Id<'events'>;
  /** Further organizer tools, e.g. open price offers */
  children?: ReactNode;
}

type EventProductWithDetails = Doc<'eventProducts'> & {
  product: Doc<'products'>;
  vendor: Doc<'users'> | null;
  discountPercent?: number;
};

export function PublicProductOrganizerActions({
  productId,
  eventId,
  children,
}: PublicProductOrganizerActionsProps) {
  const { t } = useTranslation('organizer');
  const navigate = useNavigate();

  const myRoles = useQuery(api.eventRoles.getMyRolesForEvent, { eventId }) ?? [];
  const canManage = myRoles.includes('organizer') || myRoles.includes('coorganizer');

  const ep = useQuery(
    api.eventProducts.getEventProduct,
    canManage ? { eventId, productId } : 'skip'
  ) as EventProductWithDetails | null | undefined;

  if (!canManage || !ep) return null;

  return (
    <ProductRolePanel icon={ClipboardList} title={t('staff.panel')} testId="organizer-panel">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('staff.status')}</span>
        <Badge
          variant={
            ep.status === 'available' ? 'default' : ep.status === 'sold' ? 'secondary' : 'outline'
          }
        >
          {getEventProductStatusTitle(ep.status)}
        </Badge>
      </div>

      {ep.vendor && (
        <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-1.5">
          <button
            type="button"
            onClick={() => navigate(`/events/view/${eventId}/products?vendor=${ep.vendor!._id}`)}
            className="flex items-start gap-2 text-left group"
          >
            <User className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-xs text-muted-foreground">{t('staff.seller')}</span>
              <span className="font-medium inline-flex items-center gap-1.5 group-hover:text-primary group-hover:underline">
                {[ep.vendor.firstName, ep.vendor.lastName].filter(Boolean).join(' ') ||
                  ep.vendor.name ||
                  t('staff.anonymous')}
                <ExternalLink className="h-3 w-3" />
              </span>
              {ep.vendor.managedByEventId && <WalkInBadge className="mt-1 flex w-fit" />}
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

      <InternalNoteEditor
        eventId={eventId}
        eventProductId={ep._id}
        title={ep.product?.title ?? ''}
        note={ep.internalNote}
      />

      <Button
        className="w-full gap-2"
        onClick={() => navigate(`/events/view/${eventId}/products?q=${productId}&tab=all`)}
      >
        <LayoutDashboard className="h-4 w-4" />
        {t('staff.openManagement')}
      </Button>

      {children}
    </ProductRolePanel>
  );
}
