import { LabelPrintDialog } from '../../../../components/products/LabelPrintDialog';
import { downloadSortSheets } from '../../../../lib/sortSheetsPdf';
import { clashingSortCodes } from '../../../../shared/sortCode';
import { PageSkeleton } from '../../../../components/ui/loading';
import { PageHeader } from '../../../../components/ui/page-header';
import { SearchInput } from '../../../../components/ui/search-input';
import { useMemo, useState } from 'react';
import { WalkInBadge } from '../../../../components/walkIn/WalkInBadge';
import { SellerNumberBadge } from '../../../../components/sellers/SellerNumberBadge';
import { useAssignMissingSellerNumbers } from '../../../../hooks/useAssignMissingSellerNumbers';
import { useQuery, useMutation } from '../../../../lib/api/react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../lib/api/types';
import { Badge } from '../../../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import {
  UserCircle,
  CheckCircle2,
  Mail,
  Phone,
  ChevronRight,
  UserPlus,
  UserMinus,
  ShieldCheck,
  Crown,
  Megaphone,
  Plus,
  Printer,
  SlidersHorizontal,
  MoreHorizontal,
  Ban,
  UserCheck,
} from 'lucide-react';
import { formatPriceDE } from '../../../../lib/utils';
import type { VendorWithCalculations } from '../../../../lib/api/types';
import { Tabs, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import { Button } from '../../../../components/ui/button';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { useEventAccess } from '../../../../hooks/useEventAccess';
import { WalkInSellerDialog } from '../../../../components/walkIn/WalkInSellerDialog';
import { BroadcastDialog } from '../../../../components/broadcasts/BroadcastDialog';
import { BroadcastList } from '../../../../components/broadcasts/BroadcastList';
import { HelperPickerDialog } from '../../../../components/helpers/HelperPickerDialog';
import { HelperPermissionsFields } from '../../../../components/helpers/HelperPermissionsFields';
import { HELPER_PERMISSIONS, type HelperPermission } from '../../../../shared/constants';
import { InviteDialog } from '../../../../components/invitations/InviteDialog';
import { OpenInvitations } from '../../../../components/invitations/OpenInvitations';
import { ReasonField } from '../../../../components/participation/ReasonField';
import { ExcludedBadge } from '../../../../components/participation/ExcludedBadge';
import { Trans, useTranslation } from 'react-i18next';

const NO_LABELS: Id<'products'>[] = [];

/** Texts of the helper dialog by what it does */
const HELPER_DIALOG = {
  add: {
    title: 'sellers.appointHelper',
    text: 'sellers.appointText',
    confirm: 'sellers.appoint',
  },
  edit: {
    title: 'sellers.editPermissions',
    text: 'sellers.editPermissionsText',
    confirm: 'sellers.savePermissions',
  },
  remove: { title: 'sellers.revoke', text: 'sellers.revokeText', confirm: 'sellers.revoke' },
} as const;

type SellerFilter = 'all' | 'open' | 'paid' | 'helpers';

export function SellerManagementPage() {
  const { t } = useTranslation('organizer');
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<SellerFilter>('all');
  const [walkInDialogOpen, setWalkInDialogOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [helperPickerOpen, setHelperPickerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [allLabelsOpen, setAllLabelsOpen] = useState(false);
  const allLabelIds = useQuery(
    api.labels.getEventLabelIds,
    allLabelsOpen ? { eventId: eventId as Id<'events'> } : 'skip'
  );

  // State for Helper Dialogs
  const [helperAction, setHelperAction] = useState<{
    mode: 'add' | 'edit' | 'remove';
    vendor: VendorWithCalculations;
  } | null>(null);
  // What the helper may do, chosen in the dialog for 'add' and 'edit'
  const [helperPermissions, setHelperPermissions] = useState<HelperPermission[]>([
    ...HELPER_PERMISSIONS,
  ]);
  const openHelperDialog = (mode: 'add' | 'edit' | 'remove', vendor: VendorWithCalculations) => {
    setHelperPermissions(
      mode === 'edit'
        ? (vendor.helperPermissions ?? [...HELPER_PERMISSIONS])
        : [...HELPER_PERMISSIONS]
    );
    setHelperAction({ mode, vendor });
  };

  const event = useQuery(api.events.getEvent, { id: eventId as Id<'events'> });
  // Writing to all sellers and appointing helpers stays with the organizer (and admins),
  // helpers only see the log
  const {
    isLoading: rolesLoading,
    canManage,
    canLead: canBroadcast,
    can,
  } = useEventAccess(eventId as Id<'events'>);
  const canManageHelpers = canBroadcast;

  const vendors = useQuery(api.eventRoles.getVendorsForEvent, {
    eventId: eventId as Id<'events'>,
  }) as VendorWithCalculations[] | undefined;
  // Only universal labels bring a sorting code along: one sheet for each seller's basket
  const sortSheetSellers = (vendors ?? []).flatMap((v) =>
    v.sortCode === undefined
      ? []
      : [{ sortCode: v.sortCode, name: v.name ?? '-', sellerNumber: v.sellerNumber }]
  );

  // Baskets that differ by the extra letter only
  const clashingCodes = clashingSortCodes(sortSheetSellers.map((seller) => seller.sortCode));

  const addHelper = useMutation(api.eventRoles.addCoOrganizerForEvent);
  useAssignMissingSellerNumbers(eventId as Id<'events'>, vendors, canManage);
  const removeHelper = useMutation(api.eventRoles.removeCoOrganizerForEvent);
  const setPermissions = useMutation(api.eventRoles.setHelperPermissions);

  // Taking a seller out of the bazaar and back in; organizer only, like helpers
  const excludeSeller = useMutation(api.eventExclusions.exclude);
  const readmitSeller = useMutation(api.eventExclusions.readmit);
  const [exclusionAction, setExclusionAction] = useState<{
    mode: 'exclude' | 'readmit';
    vendor: VendorWithCalculations;
  } | null>(null);
  const [exclusionReason, setExclusionReason] = useState('');
  const [exclusionSaving, setExclusionSaving] = useState(false);
  const isPast = !!event && event.endDate < Date.now();
  // Sellers without an account belong to the bazaar anyway
  const canExclude = (vendor: VendorWithCalculations) =>
    canManageHelpers && event?.organizerId !== vendor._id && !vendor.managedByEventId;
  const openExclusionDialog = (mode: 'exclude' | 'readmit', vendor: VendorWithCalculations) => {
    setExclusionReason('');
    setExclusionAction({ mode, vendor });
  };

  const executeExclusion = async (e: React.MouseEvent) => {
    if (!exclusionAction) return;
    // Open while saving; an error leaves the reason for another try
    e.preventDefault();
    const { mode, vendor } = exclusionAction;
    const args = { eventId: eventId as Id<'events'>, userId: vendor._id };
    setExclusionSaving(true);
    try {
      if (mode === 'exclude') {
        await excludeSeller({ ...args, reason: exclusionReason.trim() || undefined });
        toast.success(t('sellers.excluded', { name: vendor.name }));
      } else {
        await readmitSeller(args);
        toast.success(t('sellers.readmitted', { name: vendor.name }));
      }
      setExclusionAction(null);
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setExclusionSaving(false);
    }
  };

  const filteredVendors = useMemo(() => {
    if (!vendors) return [];

    let result = vendors;

    if (activeFilter === 'open') result = result.filter((v) => !v.paid);
    if (activeFilter === 'paid') result = result.filter((v) => v.paid);
    if (activeFilter === 'helpers') result = result.filter((v) => v.isHelper);

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase().trim();
      // A number finds the seller with that number ("17", "Nr. 17")
      const number = Number(lowerSearch.replace(/^nr\.?\s*/, ''));
      result = result.filter(
        (v) =>
          (Number.isInteger(number) && number > 0 && v.sellerNumber === number) ||
          v.name?.toLowerCase().includes(lowerSearch) ||
          (v.email ?? v.contactEmail)?.toLowerCase().includes(lowerSearch)
      );
    }

    return result;
  }, [vendors, searchTerm, activeFilter]);

  const handleSelectVendor = (vendorId: Id<'users'>) => {
    navigate(`/events/view/${eventId}/products?vendor=${vendorId}`);
  };

  const executeToggleHelper = async () => {
    if (!helperAction) return;
    const { mode, vendor } = helperAction;
    const eId = eventId as Id<'events'>;

    try {
      if (mode === 'remove') {
        await removeHelper({ eventId: eId, userId: vendor._id });
        toast.success(t('sellers.helperRemoved', { name: vendor.name }));
      } else if (mode === 'edit') {
        await setPermissions({ eventId: eId, userId: vendor._id, permissions: helperPermissions });
        toast.success(t('sellers.permissionsSaved', { name: vendor.name }));
      } else {
        await addHelper({ eventId: eId, userId: vendor._id, permissions: helperPermissions });
        toast.success(t('sellers.helperAdded', { name: vendor.name }));
      }
    } catch (error) {
      toast.error(t('sellers.actionFailed'), {
        description: error instanceof Error ? error.message : t('sellers.unknownError'),
      });
    } finally {
      setHelperAction(null);
    }
  };

  if (rolesLoading) return <PageSkeleton />;
  if (!canManage) return <div className="p-8 text-center">{t('sellers.noAccess')}</div>;

  return (
    <div className="container mx-auto space-y-6 pb-20">
      <PageHeader
        title={t('sellers.title')}
        actions={
          <div className="flex flex-wrap gap-2 *:flex-1 sm:*:flex-none">
            {canBroadcast && (
              <Button variant="outline" className="gap-2" onClick={() => setBroadcastOpen(true)}>
                <Megaphone className="h-4 w-4" /> {t('sellers.broadcast')}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Printer className="h-4 w-4" /> {t('sellers.print')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  title={t('sellers.allLabelsHint')}
                  onSelect={() => setAllLabelsOpen(true)}
                >
                  {t('sellers.allLabels')}
                </DropdownMenuItem>
                {sortSheetSellers.length > 0 && (
                  <DropdownMenuItem
                    title={t('sellers.sortSheetsHint')}
                    onSelect={() =>
                      void downloadSortSheets(sortSheetSellers, t('sellers.sortClashNote')).catch(
                        (e: unknown) => toast.error(getUserFacingErrorMessage(e))
                      )
                    }
                  >
                    {t('sellers.sortSheets')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> {t('sellers.add')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can('intake') && (
                  <DropdownMenuItem
                    disabled={!!event && event.endDate < Date.now()}
                    onSelect={() => setWalkInDialogOpen(true)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" /> {t('sellers.walkIn')}
                  </DropdownMenuItem>
                )}
                {canManageHelpers && (
                  <DropdownMenuItem onSelect={() => setHelperPickerOpen(true)}>
                    <ShieldCheck className="mr-2 h-4 w-4" /> {t('sellers.addHelper')}
                  </DropdownMenuItem>
                )}
                {canManageHelpers && (
                  <DropdownMenuItem
                    disabled={!!event && event.endDate < Date.now()}
                    onSelect={() => setInviteOpen(true)}
                  >
                    <Mail className="mr-2 h-4 w-4" /> {t('sellers.invite')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {clashingCodes.size > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
        >
          {t('sellers.sortClash', { count: clashingCodes.size })}
        </p>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Tabs
          value={activeFilter}
          onValueChange={(v) => setActiveFilter(v as SellerFilter)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all">{t('sellers.all')}</TabsTrigger>
            <TabsTrigger value="open">{t('sellers.open')}</TabsTrigger>
            <TabsTrigger value="paid">{t('sellers.paid')}</TabsTrigger>
            <TabsTrigger value="helpers">{t('sellers.helpers')}</TabsTrigger>
          </TabsList>
        </Tabs>

        <SearchInput
          className="w-full sm:w-72"
          placeholder={t('sellers.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Table only where it fits; the side menu takes room on tablets, too */}
      <div className="@container">
        <div className="hidden @4xl:block bg-card border rounded-xl overflow-hidden shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('sellers.participant')}</TableHead>
                <TableHead>{t('sellers.details')}</TableHead>
                <TableHead className="text-right">{t('sellers.netRevenue')}</TableHead>
                <TableHead className="text-center">{t('sellers.status')}</TableHead>
                <TableHead className="text-center">{t('sellers.role')}</TableHead>
                <TableHead className="w-[84px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                    {activeFilter === 'helpers' && !searchTerm
                      ? t('sellers.noHelpers')
                      : t('sellers.noneForFilter')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredVendors.map((v) => {
                  const isOwner = event?.organizerId === v._id;
                  return (
                    <TableRow
                      key={v._id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors group"
                      onClick={() => handleSelectVendor(v._id)}
                    >
                      <TableCell className="whitespace-normal">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 bg-primary/10 rounded-full flex items-center justify-center text-primary shrink-0">
                            {isOwner ? (
                              <Crown className="h-5 w-5" />
                            ) : (
                              <UserCircle className="h-5 w-5" />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              <span className="font-medium">{v.name}</span>
                              <SellerNumberBadge number={v.sellerNumber} />
                              {v.managedByEventId && <WalkInBadge />}
                              {v.excluded && <ExcludedBadge exclusion={v.excluded} />}
                              {v.isHelper && !isOwner && (
                                <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                              )}
                            </div>
                            {/* Mail and phone follow in the next column */}
                            {v.managedByEventId && (
                              <span className="text-xs text-muted-foreground truncate">
                                {t('sellers.walkInCreated')}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                          {(v.email ?? v.contactEmail) && (
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3 w-3" /> {v.email ?? v.contactEmail}
                            </div>
                          )}
                          {v.phone && (
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3" /> {v.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium tabular-nums">
                          {formatPriceDE(v.totalRevenue)} €
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <PaidBadge paid={v.paid} />
                      </TableCell>
                      <TableCell className="text-center">
                        {isOwner ? (
                          <Badge variant="default" className="bg-primary hover:bg-primary gap-1">
                            <Crown className="h-3 w-3" /> {t('sellers.owner')}
                          </Badge>
                        ) : v.isHelper ? (
                          <span className="inline-flex items-center gap-1">
                            <Badge variant="secondary" className="gap-1">
                              <ShieldCheck className="h-3 w-3" /> {t('sellers.helpers')}
                            </Badge>
                            {canManageHelpers && (
                              <>
                                <EditPermissionsButton
                                  iconOnly
                                  onClick={() => openHelperDialog('edit', v)}
                                />
                                <RemoveHelperButton
                                  iconOnly
                                  onClick={() => openHelperDialog('remove', v)}
                                />
                              </>
                            )}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {canExclude(v) && (
                            <SellerActionsMenu
                              vendor={v}
                              isPast={isPast}
                              onAction={(mode) => openExclusionDialog(mode, v)}
                            />
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-4 @2xl:grid-cols-2 @4xl:hidden">
          {filteredVendors.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground bg-card border rounded-xl italic @2xl:col-span-2">
              {activeFilter === 'helpers' && !searchTerm
                ? t('sellers.noHelpers')
                : t('sellers.none')}
            </div>
          ) : (
            filteredVendors.map((v) => {
              const isOwner = event?.organizerId === v._id;
              return (
                <div
                  key={v._id}
                  className="flex flex-col gap-3 bg-card border rounded-xl p-4 shadow-xs"
                  onClick={() => handleSelectVendor(v._id)}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-10 w-10 shrink-0 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                        {isOwner ? (
                          <Crown className="h-6 w-6" />
                        ) : (
                          <UserCircle className="h-6 w-6" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="break-words font-medium">{v.name}</span>
                          <SellerNumberBadge number={v.sellerNumber} />
                          {v.managedByEventId && <WalkInBadge />}
                          {v.excluded && <ExcludedBadge exclusion={v.excluded} />}
                          {isOwner && <Crown className="h-3.5 w-3.5 text-primary" />}
                          {v.isHelper && !isOwner && (
                            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                        <div className="break-all text-xs text-muted-foreground">
                          {v.managedByEventId ? t('sellers.walkInCreated') : v.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {canExclude(v) && (
                        <SellerActionsMenu
                          vendor={v}
                          isPast={isPast}
                          onAction={(mode) => openExclusionDialog(mode, v)}
                        />
                      )}
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                    <div>
                      <div className="text-xs text-muted-foreground">{t('sellers.revenue')}</div>
                      <div className="text-base font-semibold tabular-nums">
                        {formatPriceDE(v.totalRevenue)} €
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">{t('sellers.status')}</div>
                      <PaidBadge paid={v.paid} />
                    </div>
                  </div>

                  {canManageHelpers && !isOwner && v.isHelper && (
                    <div className="mt-auto flex gap-2 *:flex-1">
                      <EditPermissionsButton onClick={() => openHelperDialog('edit', v)} />
                      <RemoveHelperButton onClick={() => openHelperDialog('remove', v)} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {canManageHelpers && <OpenInvitations eventId={eventId as Id<'events'>} />}

      <BroadcastList eventId={eventId as Id<'events'>} title={t('sellers.sentMessages')} />

      <BroadcastDialog
        eventId={eventId as Id<'events'>}
        open={broadcastOpen}
        onOpenChange={setBroadcastOpen}
      />
      {canManageHelpers && vendors && (
        <HelperPickerDialog
          vendors={vendors}
          ownerId={event?.organizerId}
          open={helperPickerOpen}
          onOpenChange={setHelperPickerOpen}
          onPick={(vendor) => {
            setHelperPickerOpen(false);
            openHelperDialog('add', vendor);
          }}
        />
      )}
      {canManageHelpers && (
        <InviteDialog
          eventId={eventId as Id<'events'>}
          vendors={vendors ?? []}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      )}
      <WalkInSellerDialog
        eventId={eventId as Id<'events'>}
        open={walkInDialogOpen}
        onOpenChange={setWalkInDialogOpen}
        onCreated={(sellerId) => navigate(`/events/view/${eventId}/products?vendor=${sellerId}`)}
      />

      {/* Helper Confirmation Dialogs */}
      <LabelPrintDialog
        open={allLabelsOpen}
        onOpenChange={setAllLabelsOpen}
        selection={allLabelIds ?? NO_LABELS}
        eventId={eventId}
      />

      <ConfirmDialog
        open={!!exclusionAction}
        onOpenChange={(open) => !open && !exclusionSaving && setExclusionAction(null)}
        title={t(
          exclusionAction?.mode === 'readmit' ? 'sellers.readmitTitle' : 'sellers.excludeTitle',
          { name: exclusionAction?.vendor.name }
        )}
        description={
          exclusionAction?.mode === 'readmit' ? (
            t('sellers.readmitText')
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              <li>{t('sellers.excludeNoReturn')}</li>
              <li>{t('sellers.excludeItems')}</li>
              <li>{t('sellers.excludeMail')}</li>
            </ul>
          )
        }
        confirmLabel={t(
          exclusionAction?.mode === 'readmit' ? 'sellers.readmit' : 'sellers.excludeConfirm'
        )}
        destructive={exclusionAction?.mode !== 'readmit'}
        loading={exclusionSaving}
        onConfirm={executeExclusion}
      >
        {exclusionAction?.mode === 'exclude' && (
          <ReasonField
            value={exclusionReason}
            onChange={setExclusionReason}
            placeholder={t('sellers.excludeReasonPlaceholder')}
          />
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!helperAction}
        onOpenChange={(open) => !open && setHelperAction(null)}
        title={t(HELPER_DIALOG[helperAction?.mode ?? 'add'].title)}
        description={
          <Trans
            i18nKey={HELPER_DIALOG[helperAction?.mode ?? 'add'].text}
            ns="organizer"
            values={{ name: helperAction?.vendor.name }}
            components={{ b: <b /> }}
          />
        }
        confirmLabel={t(HELPER_DIALOG[helperAction?.mode ?? 'add'].confirm)}
        destructive={helperAction?.mode === 'remove'}
        onConfirm={executeToggleHelper}
      >
        {helperAction && helperAction.mode !== 'remove' && (
          <HelperPermissionsFields value={helperPermissions} onChange={setHelperPermissions} />
        )}
      </ConfirmDialog>
    </div>
  );
}

/** Whether the seller got their money already. */
function PaidBadge({ paid }: { paid?: boolean }) {
  const { t } = useTranslation('organizer');
  return paid ? (
    <Badge variant="secondary" className="gap-1.5 whitespace-nowrap">
      <CheckCircle2 className="h-3 w-3" /> {t('sellers.paid')}
    </Badge>
  ) : (
    <Badge variant="outline" className="whitespace-nowrap">
      {t('sellers.open')}
    </Badge>
  );
}

/** Changes what the helper may do. */
function EditPermissionsButton({ onClick, iconOnly }: { onClick: () => void; iconOnly?: boolean }) {
  const { t } = useTranslation('organizer');
  const label = t('sellers.editPermissions');
  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon' : 'sm'}
      title={label}
      aria-label={label}
      className={iconOnly ? 'text-muted-foreground' : 'w-full gap-2 text-muted-foreground'}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <SlidersHorizontal className="h-4 w-4" />
      {!iconOnly && label}
    </Button>
  );
}

/** Takes the helper role back; quiet, because it is rarely needed. */
function RemoveHelperButton({ onClick, iconOnly }: { onClick: () => void; iconOnly?: boolean }) {
  const { t } = useTranslation('organizer');
  const label = t('sellers.removeHelper');
  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon' : 'sm'}
      title={label}
      aria-label={label}
      className={iconOnly ? 'text-muted-foreground' : 'w-full gap-2 text-muted-foreground'}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <UserMinus className="h-4 w-4" />
      {!iconOnly && label}
    </Button>
  );
}

/** Rare steps for one seller: out of the bazaar, or back in. */
function SellerActionsMenu({
  vendor,
  isPast,
  onAction,
}: {
  vendor: VendorWithCalculations;
  isPast: boolean;
  onAction: (mode: 'exclude' | 'readmit') => void;
}) {
  const { t } = useTranslation('organizer');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={t('sellers.moreFor', { name: vendor.name })}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {vendor.excluded ? (
          <DropdownMenuItem onSelect={() => onAction('readmit')}>
            <UserCheck /> {t('sellers.readmit')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            disabled={isPast}
            onSelect={() => onAction('exclude')}
          >
            <Ban /> {t('sellers.exclude')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
