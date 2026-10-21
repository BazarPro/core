import { useMemo, useState } from 'react';
import { WalkInBadge } from '../../../../components/walkIn/WalkInBadge';
import { SellerNumberBadge } from '../../../../components/sellers/SellerNumberBadge';
import { useAssignMissingSellerNumbers } from '../../../../hooks/useAssignMissingSellerNumbers';
import { useQuery, useMutation } from '../../../../lib/api/react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Input } from '../../../../components/ui/input';
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
  Search,
  UserCircle,
  CheckCircle2,
  DollarSign,
  Mail,
  Phone,
  ChevronRight,
  UserPlus,
  UserMinus,
  ShieldCheck,
  Filter,
  Crown,
  AlertTriangle,
  Info,
  Megaphone,
} from 'lucide-react';
import { formatPriceDE } from '../../../../lib/utils';
import type { VendorWithCalculations } from '../../../../../convex/eventRoles';
import { Tabs, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import { Button } from '../../../../components/ui/button';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../components/ui/alert-dialog';
import { WalkInSellerDialog } from '../../../../components/walkIn/WalkInSellerDialog';
import { BroadcastDialog } from '../../../../components/broadcasts/BroadcastDialog';
import { BroadcastList } from '../../../../components/broadcasts/BroadcastList';
import { HelperPickerDialog } from '../../../../components/helpers/HelperPickerDialog';
import { Trans, useTranslation } from 'react-i18next';

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

  // State for Helper Dialogs
  const [helperAction, setHelperAction] = useState<{
    mode: 'add' | 'remove';
    vendor: VendorWithCalculations;
  } | null>(null);

  const event = useQuery(api.events.getEvent, { id: eventId as Id<'events'> });
  const viewer = useQuery(api.users.viewer);
  const myRoles = useQuery(api.eventRoles.getMyRolesForEvent, { eventId: eventId as Id<'events'> });
  const canManage =
    (myRoles ?? []).includes('organizer') || (myRoles ?? []).includes('coorganizer');
  // Writing to all sellers stays with the organizer, helpers only see the log
  const canBroadcast = (myRoles ?? []).includes('organizer') || viewer?.systemRole === 'admin';

  // Organizers and admins appoint helpers (as the backend allows); helpers cannot
  const canManageHelpers = canBroadcast;

  const vendors = useQuery(api.eventRoles.getVendorsForEvent, {
    eventId: eventId as Id<'events'>,
  }) as VendorWithCalculations[] | undefined;

  const addHelper = useMutation(api.eventRoles.addCoOrganizerForEvent);
  useAssignMissingSellerNumbers(eventId as Id<'events'>, vendors, canManage);
  const removeHelper = useMutation(api.eventRoles.removeCoOrganizerForEvent);

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
      } else {
        await addHelper({ eventId: eId, userId: vendor._id });
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

  if (!canManage) return <div className="p-8 text-center">{t('sellers.noAccess')}</div>;

  return (
    <div className="container mx-auto space-y-6 pb-20">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('sellers.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('sellers.subtitle')}</p>
        </div>
        <div className="flex w-full xl:w-auto flex-col sm:flex-row gap-2">
          {canBroadcast && (
            <Button variant="outline" className="gap-2" onClick={() => setBroadcastOpen(true)}>
              <Megaphone className="h-4 w-4" /> {t('sellers.broadcast')}
            </Button>
          )}
          {canManageHelpers && (
            <Button variant="outline" className="gap-2" onClick={() => setHelperPickerOpen(true)}>
              <ShieldCheck className="h-4 w-4" /> {t('sellers.addHelper')}
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setWalkInDialogOpen(true)}
            disabled={!!event && event.endDate < Date.now()}
          >
            <UserPlus className="h-4 w-4" /> {t('sellers.walkIn')}
          </Button>
          <div className="relative w-full xl:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('sellers.search')}
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

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

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
          <Filter className="h-3 w-3" />
          <span>{t('sellers.shown', { count: filteredVendors.length })}</span>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-card border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[300px]">{t('sellers.participant')}</TableHead>
              <TableHead>{t('sellers.details')}</TableHead>
              <TableHead className="text-right">{t('sellers.netRevenue')}</TableHead>
              <TableHead className="text-center">{t('sellers.status')}</TableHead>
              <TableHead className="text-center">{t('sellers.role')}</TableHead>
              <TableHead className="w-[50px]"></TableHead>
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
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 bg-primary/10 rounded-full flex items-center justify-center text-primary shrink-0">
                          {isOwner ? (
                            <Crown className="h-5 w-5" />
                          ) : (
                            <UserCircle className="h-5 w-5" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold truncate">{v.name}</span>
                            <SellerNumberBadge number={v.sellerNumber} />
                            {v.managedByEventId && <WalkInBadge />}
                            {v.isHelper && !isOwner && (
                              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground uppercase font-medium truncate">
                            {v.managedByEventId ? t('sellers.walkInCreated') : v.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
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
                      <div className="font-mono font-bold text-sm">
                        {formatPriceDE(v.totalRevenue)} €
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {v.paid ? (
                        <Badge variant="secondary" className="gap-1.5 whitespace-nowrap">
                          <CheckCircle2 className="h-3 w-3" /> {t('sellers.paid')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1.5 whitespace-nowrap">
                          <DollarSign className="h-3 w-3" /> {t('sellers.open')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isOwner ? (
                        <Badge variant="default" className="bg-primary hover:bg-primary gap-1">
                          <Crown className="h-3 w-3" /> {t('sellers.owner')}
                        </Badge>
                      ) : canManageHelpers && !v.managedByEventId ? (
                        <Button
                          variant={v.isHelper ? 'secondary' : 'outline'}
                          size="sm"
                          className="gap-1.5 whitespace-nowrap"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHelperAction({ mode: v.isHelper ? 'remove' : 'add', vendor: v });
                          }}
                        >
                          {v.isHelper ? (
                            <>
                              <UserMinus className="h-3.5 w-3.5" /> {t('sellers.removeHelper')}
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3.5 w-3.5" /> {t('sellers.makeHelper')}
                            </>
                          )}
                        </Button>
                      ) : v.isHelper ? (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" /> {t('sellers.helpers')}
                        </Badge>
                      ) : null}
                    </TableCell>
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

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filteredVendors.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground bg-card border rounded-xl italic">
            {activeFilter === 'helpers' && !searchTerm ? t('sellers.noHelpers') : t('sellers.none')}
          </div>
        ) : (
          filteredVendors.map((v) => {
            const isOwner = event?.organizerId === v._id;
            return (
              <div
                key={v._id}
                className="bg-card border rounded-xl p-4 shadow-sm space-y-4 active:scale-[0.98] transition-transform"
                onClick={() => handleSelectVendor(v._id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                      {isOwner ? <Crown className="h-6 w-6" /> : <UserCircle className="h-6 w-6" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">{v.name}</span>
                        <SellerNumberBadge number={v.sellerNumber} />
                        {v.managedByEventId && <WalkInBadge />}
                        {isOwner && <Crown className="h-3.5 w-3.5 text-primary" />}
                        {v.isHelper && !isOwner && (
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase">
                        {v.managedByEventId ? t('sellers.walkInCreated') : v.email}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      {t('sellers.revenue')}
                    </div>
                    <div className="font-mono font-bold text-lg">
                      {formatPriceDE(v.totalRevenue)} €
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      {t('sellers.status')}
                    </div>
                    {v.paid ? (
                      <Badge variant="secondary" className="mt-1">
                        {t('sellers.paid')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="mt-1">
                        {t('sellers.open')}
                      </Badge>
                    )}
                  </div>
                </div>

                {canManageHelpers && !isOwner && !v.managedByEventId && (
                  <div className="pt-2">
                    <Button
                      variant={v.isHelper ? 'secondary' : 'outline'}
                      size="sm"
                      className="w-full gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHelperAction({ mode: v.isHelper ? 'remove' : 'add', vendor: v });
                      }}
                    >
                      {v.isHelper ? (
                        <>
                          <UserMinus className="h-4 w-4" /> {t('sellers.removeHelper')}
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" /> {t('sellers.makeHelper')}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

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
            setHelperAction({ mode: 'add', vendor });
          }}
        />
      )}
      <WalkInSellerDialog
        eventId={eventId as Id<'events'>}
        open={walkInDialogOpen}
        onOpenChange={setWalkInDialogOpen}
        onCreated={(sellerId) => navigate(`/events/view/${eventId}/products?vendor=${sellerId}`)}
      />

      {/* Helper Confirmation Dialogs */}
      <AlertDialog open={!!helperAction} onOpenChange={(open) => !open && setHelperAction(null)}>
        <AlertDialogContent className="sm:max-w-[450px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {helperAction?.mode === 'add' ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-primary" /> {t('sellers.appointHelper')}
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-destructive" /> {t('sellers.revoke')}
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {helperAction?.mode === 'add' ? (
                <>
                  <p>
                    <Trans
                      i18nKey="sellers.appointText"
                      ns="organizer"
                      values={{ name: helperAction.vendor.name }}
                      components={{ b: <b /> }}
                    />
                  </p>
                  <div className="bg-muted p-4 rounded-lg space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5" /> {t('sellers.helperCan')}
                    </p>
                    <ul className="text-xs space-y-1.5">
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                        <span>{t('sellers.canCheckIn')}</span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                        <span>{t('sellers.canSell')}</span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                        <span>{t('sellers.canSettle')}</span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                        <span>{t('sellers.canPrint')}</span>
                      </li>
                    </ul>
                  </div>
                  <p className="text-[10px] italic text-muted-foreground">
                    {t('sellers.helperLimits')}
                  </p>
                </>
              ) : (
                <p>
                  <Trans
                    i18nKey="sellers.revokeText"
                    ns="organizer"
                    values={{ name: helperAction?.vendor.name }}
                    components={{ b: <b /> }}
                  />
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeToggleHelper}
              className={
                helperAction?.mode === 'remove' ? 'bg-destructive hover:bg-destructive/90' : ''
              }
            >
              {helperAction?.mode === 'add' ? t('sellers.appoint') : t('sellers.revoke')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
