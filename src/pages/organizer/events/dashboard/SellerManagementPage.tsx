import { LabelPrintDialog } from '../../../../components/products/LabelPrintDialog';
import { downloadSortSheets } from '../../../../lib/sortSheetsPdf';
import { clashingSortCodes } from '../../../../shared/sortCode';
import { PageSkeleton } from '../../../../components/ui/loading';
import { PageHeader } from '../../../../components/ui/page-header';
import { SearchInput } from '../../../../components/ui/search-input';
import { NativeSelect } from '../../../../components/ui/native-select';
import { useMemo, useState } from 'react';
import { WalkInBadge } from '../../../../components/walkIn/WalkInBadge';
import { SellerNumberBadge } from '../../../../components/sellers/SellerNumberBadge';
import { FeeGroupBadge } from '../../../../components/sellers/FeeGroupBadge';
import { useAssignMissingSellerNumbers } from '../../../../hooks/useAssignMissingSellerNumbers';
import { useQuery } from '../../../../lib/api/react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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
  CheckCircle2,
  Mail,
  Phone,
  ChevronRight,
  UserPlus,
  ShieldCheck,
  Crown,
  Megaphone,
  Plus,
  Printer,
} from 'lucide-react';
import { formatPrice } from '../../../../lib/utils';
import type { VendorWithCalculations } from '../../../../lib/api/types';
import { Tabs, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import { Button } from '../../../../components/ui/button';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
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
import {
  HelperRoleDialog,
  type HelperAction,
} from '../../../../components/helpers/HelperRoleDialog';
import { InviteDialog } from '../../../../components/invitations/InviteDialog';
import { OpenInvitations } from '../../../../components/invitations/OpenInvitations';
import { ExcludedBadge } from '../../../../components/participation/ExcludedBadge';
import { RegistrationPanel } from '../../../../components/participation/RegistrationPanel';
import { useTranslation } from 'react-i18next';
import { SellersWithoutItems } from '../../../../components/sellers/SellersWithoutItems';
import type { BroadcastAudience } from '../../../../shared/constants';

const NO_LABELS: Id<'products'>[] = [];

type SellerFilter = 'all' | 'open' | 'paid' | 'helpers' | 'withoutItems';

/** All sellers, those without a group, or the id of one fee group */
type GroupFilter = 'all' | 'none' | (string & {});

export function SellerManagementPage() {
  const { t } = useTranslation('organizer');
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  // The settlement opens this page on the sellers still to be paid
  const location = useLocation();
  const [activeFilter, setActiveFilter] = useState<SellerFilter>(
    () => (location.state as { filter?: SellerFilter } | null)?.filter ?? 'all'
  );
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [walkInDialogOpen, setWalkInDialogOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastAudience, setBroadcastAudience] = useState<BroadcastAudience>('all');
  const [helperPickerOpen, setHelperPickerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [allLabelsOpen, setAllLabelsOpen] = useState(false);
  const allLabelIds = useQuery(
    api.labels.getEventLabelIds,
    allLabelsOpen ? { eventId: eventId as Id<'events'> } : 'skip'
  );

  const [helperAction, setHelperAction] = useState<HelperAction | null>(null);

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

  useAssignMissingSellerNumbers(eventId as Id<'events'>, vendors, canManage);

  const feeGroups = event?.features?.feeGroups ?? [];
  const pendingIn = (groupId: string) =>
    (vendors ?? []).filter((v) => v.feeGroup?.pending && v.feeGroup.id === groupId).length;
  // A group gone from the settings (or another bazaar's) filters nothing
  const shownGroupFilter =
    groupFilter === 'all' || groupFilter === 'none' || feeGroups.some((g) => g.id === groupFilter)
      ? groupFilter
      : 'all';

  const filteredVendors = useMemo(() => {
    if (!vendors) return [];

    let result = vendors;

    if (activeFilter === 'open') result = result.filter((v) => !v.paid);
    if (activeFilter === 'paid') result = result.filter((v) => v.paid);
    if (activeFilter === 'helpers') result = result.filter((v) => v.isHelper);
    if (activeFilter === 'withoutItems') result = result.filter((v) => v.withoutItems);
    if (shownGroupFilter === 'none') result = result.filter((v) => !v.feeGroup);
    // Unchecked self-declarations first: they hold up the intake
    else if (shownGroupFilter !== 'all') {
      result = result
        .filter((v) => v.feeGroup?.id === shownGroupFilter)
        .sort((a, b) => Number(!!b.feeGroup?.pending) - Number(!!a.feeGroup?.pending));
    }

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
  }, [vendors, searchTerm, activeFilter, shownGroupFilter]);

  const withoutItems = (vendors ?? []).filter((v) => v.withoutItems).length;
  const openBroadcast = (audience: BroadcastAudience) => {
    setBroadcastAudience(audience);
    setBroadcastOpen(true);
  };

  const handleSelectVendor = (vendorId: Id<'users'>) => {
    navigate(`/events/view/${eventId}/products?vendor=${vendorId}`);
  };

  const pendingGroups =
    shownGroupFilter === 'all' || shownGroupFilter === 'none' ? 0 : pendingIn(shownGroupFilter);
  const emptyText =
    activeFilter === 'helpers' && !searchTerm && shownGroupFilter === 'all'
      ? t('sellers.noHelpers')
      : undefined;

  if (rolesLoading) return <PageSkeleton />;
  if (!canManage) return <div className="p-8 text-center">{t('sellers.noAccess')}</div>;

  // The role column only when someone in the list has one: else it stays empty
  const showRoles = filteredVendors.some((v) => v.isHelper || event?.organizerId === v._id);

  return (
    <div className="page-wide space-y-6 pb-20">
      <PageHeader
        title={t('sellers.title')}
        actions={
          // Phones: one line, the main action wide, the others as icons
          <div className="flex gap-2 sm:flex-wrap">
            {canBroadcast && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => openBroadcast('all')}
                aria-label={t('sellers.broadcast')}
              >
                <Megaphone className="h-4 w-4" />
                <span className="max-sm:sr-only">{t('sellers.broadcast')}</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" aria-label={t('sellers.print')}>
                  <Printer className="h-4 w-4" />
                  <span className="max-sm:sr-only">{t('sellers.print')}</span>
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
                <Button className="gap-2 max-sm:flex-1">
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

      {event && (
        <RegistrationPanel
          event={event}
          canSwitch={canBroadcast}
          sellers={vendors?.filter((v) => !v.isHelper).length}
        />
      )}

      {clashingCodes.size > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-warning-soft-foreground/30 bg-warning-soft p-3 text-sm"
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
          {/* Phones: one row to swipe, a fade at the edge says so */}
          <TabsList className="flex h-auto w-full justify-start overflow-x-auto [mask-image:linear-gradient(90deg,#000_85%,transparent)] *:shrink-0 sm:grid sm:grid-cols-5 sm:[mask-image:none]">
            <TabsTrigger value="all">{t('sellers.all')}</TabsTrigger>
            <TabsTrigger value="open">{t('sellers.open')}</TabsTrigger>
            <TabsTrigger value="paid">{t('sellers.paid')}</TabsTrigger>
            <TabsTrigger value="helpers">{t('sellers.helpers')}</TabsTrigger>
            <TabsTrigger value="withoutItems" className="gap-1.5">
              {t('sellers.withoutItems')}
              {withoutItems > 0 && (
                <span className="rounded-full bg-warning-soft px-1.5 text-[11px] font-semibold tabular-nums text-warning-soft-foreground">
                  {withoutItems}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {feeGroups.length > 0 && (
            <NativeSelect
              aria-label={t('sellerFeeGroup.filter')}
              className="w-full sm:w-52"
              value={shownGroupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="all">{t('sellerFeeGroup.allGroups')}</option>
              {feeGroups.map((group) => {
                const pending = pendingIn(group.id);
                return (
                  <option key={group.id} value={group.id}>
                    {pending > 0
                      ? t('sellerFeeGroup.withPending', { group: group.label, count: pending })
                      : group.label}
                  </option>
                );
              })}
              <option value="none">{t('sellerFeeGroup.none')}</option>
            </NativeSelect>
          )}
          <SearchInput
            className="w-full sm:w-72"
            placeholder={t('sellers.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {activeFilter === 'withoutItems' && vendors && (
        <SellersWithoutItems
          eventId={eventId as Id<'events'>}
          count={withoutItems}
          canAct={canBroadcast}
          over={!!event && event.endDate < Date.now()}
          onRemind={() => openBroadcast('withoutItems')}
        />
      )}

      {pendingGroups > 0 && (
        <p className="rounded-lg border border-warning-soft-foreground/30 bg-warning-soft p-3 text-sm">
          {t('sellerFeeGroup.pendingCount', { count: pendingGroups })}
        </p>
      )}

      {/* Table only where it fits; the side menu takes room on tablets, too */}
      <div className="@container">
        <div className="hidden @4xl:block bg-card border rounded-xl overflow-hidden shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('sellers.participant')}</TableHead>
                <TableHead>{t('sellers.details')}</TableHead>
                <TableHead className="text-right">{t('sellers.revenue')}</TableHead>
                <TableHead className="text-center">{t('sellers.status')}</TableHead>
                {showRoles && <TableHead className="text-center">{t('sellers.role')}</TableHead>}
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={showRoles ? 6 : 5}
                    className="h-32 text-center text-muted-foreground italic"
                  >
                    {emptyText ?? t('sellers.noneForFilter')}
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
                            {isOwner ? <Crown className="h-5 w-5" /> : <Initials name={v.name} />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              <span className="font-medium">{v.name}</span>
                              <SellerNumberBadge number={v.sellerNumber} />
                              {v.managedByEventId && <WalkInBadge />}
                              {v.excluded && <ExcludedBadge exclusion={v.excluded} />}
                              <FeeGroupBadge group={v.feeGroup} />
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
                          {formatPrice(v.totalRevenue)} €
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <PaidBadge paid={v.paid} />
                      </TableCell>
                      {showRoles && (
                        <TableCell className="text-center">
                          {isOwner ? (
                            <Badge variant="default" className="bg-primary hover:bg-primary gap-1">
                              <Crown className="h-3 w-3" /> {t('sellers.owner')}
                            </Badge>
                          ) : v.isHelper ? (
                            <Badge variant="secondary" className="gap-1">
                              <ShieldCheck className="h-3 w-3" /> {t('sellers.helpers')}
                            </Badge>
                          ) : null}
                        </TableCell>
                      )}
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
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
              {emptyText ?? t('sellers.none')}
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
                        {isOwner ? <Crown className="h-6 w-6" /> : <Initials name={v.name} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="break-words font-medium">{v.name}</span>
                          <SellerNumberBadge number={v.sellerNumber} />
                          {v.managedByEventId && <WalkInBadge />}
                          {v.excluded && <ExcludedBadge exclusion={v.excluded} />}
                          <FeeGroupBadge group={v.feeGroup} />
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
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                    <div>
                      <div className="text-xs text-muted-foreground">{t('sellers.revenue')}</div>
                      <div className="text-base font-semibold tabular-nums">
                        {formatPrice(v.totalRevenue)} €
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">{t('sellers.status')}</div>
                      <PaidBadge paid={v.paid} />
                    </div>
                  </div>
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
        initialAudience={broadcastAudience}
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
            setHelperAction({ mode: 'add', vendor });
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

      <LabelPrintDialog
        open={allLabelsOpen}
        onOpenChange={setAllLabelsOpen}
        selection={allLabelIds ?? NO_LABELS}
        eventId={eventId}
      />

      <HelperRoleDialog
        eventId={eventId as Id<'events'>}
        action={helperAction}
        onActionChange={setHelperAction}
      />
    </div>
  );
}

/** Whether the seller got their money already. */
function PaidBadge({ paid }: { paid?: boolean }) {
  const { t } = useTranslation('organizer');
  return paid ? (
    <Badge variant="success" className="gap-1.5 whitespace-nowrap">
      <CheckCircle2 className="h-3 w-3" /> {t('sellers.paid')}
    </Badge>
  ) : (
    // The usual state: quiet text, only what happened stands out
    <span className="whitespace-nowrap text-sm text-muted-foreground">{t('sellers.open')}</span>
  );
}

/** "Lena Hoffmann" → "LH": tells the rows apart better than one icon for everybody */
function Initials({ name }: { name?: string }) {
  const letters = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .filter((letter) => /\p{L}/u.test(letter));
  const text = (letters.length > 1 ? letters[0] + letters[letters.length - 1] : letters[0]) ?? '?';
  return (
    <span aria-hidden="true" className="font-display text-sm font-bold">
      {text.toUpperCase()}
    </span>
  );
}
