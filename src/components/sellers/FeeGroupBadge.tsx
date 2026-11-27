import { useState } from 'react';
import { BadgePercent } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Id, VendorWithCalculations } from '../../lib/api/types';
import type { FeeGroup } from '../../shared/feeGroups';
import { api } from '../../lib/api/functions';
import { useMutation } from '../../lib/api/react';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';
import {
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '../ui/dropdown-menu';

/** The seller's fee group next to their name; amber while the intake still checks it. */
export function FeeGroupBadge({ group }: { group: VendorWithCalculations['feeGroup'] }) {
  const { t } = useTranslation('organizer');
  if (!group) return null;
  return (
    <span
      className={badgeClass(group)}
      title={group.pending ? t('sellerFeeGroup.pendingHint') : t('sellerFeeGroup.title')}
    >
      <BadgeContent group={group} />
    </span>
  );
}

function badgeClass(group: VendorWithCalculations['feeGroup']) {
  return cn(
    'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium',
    group?.pending
      ? 'border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground'
      : 'border-primary/20 bg-primary/5 text-primary'
  );
}

function BadgeContent({ group }: { group: NonNullable<VendorWithCalculations['feeGroup']> }) {
  const { t } = useTranslation('organizer');
  return (
    <>
      <BadgePercent className="h-3 w-3" />
      {group.label}
      {group.pending && <span className="font-normal">· {t('sellerFeeGroup.pending')}</span>}
    </>
  );
}

/**
 * The organizer puts a seller in a fee group by hand, e.g. a helper without rights in
 * the helper group, or takes them out. Helper groups apply by role anyway.
 * A submenu for the seller's "…" menu; nothing once paid out, the group is settled then.
 */
export function FeeGroupSubMenu({
  eventId,
  vendor,
  groups,
}: {
  eventId: Id<'events'>;
  vendor: VendorWithCalculations;
  groups: FeeGroup[];
}) {
  const { t } = useTranslation('organizer');
  const assign = useMutation(api.feeGroups.assignFeeGroup);
  const [busy, setBusy] = useState(false);
  if (groups.length === 0 || vendor.paid) return null;
  const current = vendor.feeGroup?.byRole
    ? (vendor.feeGroup.chosen ?? 'none')
    : (vendor.feeGroup?.id ?? 'none');

  const choose = async (value: string) => {
    if (value === current) return;
    setBusy(true);
    try {
      await assign({ eventId, sellerId: vendor._id, groupId: value === 'none' ? null : value });
      const group = groups.find((candidate) => candidate.id === value);
      toast.success(
        group
          ? t('sellerFeeGroup.assigned', { name: vendor.name, group: group.label })
          : t('sellerFeeGroup.unassigned', { name: vendor.name })
      );
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={busy} className="gap-2">
        <BadgePercent className="h-4 w-4 text-muted-foreground" />
        {t('sellerFeeGroup.assign')}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="max-w-64">
          <DropdownMenuLabel>{t('sellerFeeGroup.title')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={current} onValueChange={(value) => void choose(value)}>
            <DropdownMenuRadioItem value="none">{t('sellerFeeGroup.none')}</DropdownMenuRadioItem>
            {groups.map((group) => (
              <DropdownMenuRadioItem key={group.id} value={group.id}>
                {group.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {vendor.feeGroup?.byRole && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {t('sellerFeeGroup.byRole', { group: vendor.feeGroup.label })}
            </p>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
