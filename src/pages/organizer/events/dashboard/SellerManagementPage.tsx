import { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../../../convex/_generated/api';
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

type SellerFilter = 'all' | 'open' | 'paid' | 'helpers';

export function SellerManagementPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<SellerFilter>('all');

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

  // Check if current user is the main organizer (owner)
  const isMainOrganizer = viewer?._id === event?.organizerId;

  const vendors = useQuery(api.eventRoles.getVendorsForEvent, {
    eventId: eventId as Id<'events'>,
  }) as VendorWithCalculations[] | undefined;

  const addHelper = useMutation(api.eventRoles.addCoOrganizerForEvent);
  const removeHelper = useMutation(api.eventRoles.removeCoOrganizerForEvent);

  const filteredVendors = useMemo(() => {
    if (!vendors) return [];

    let result = vendors;

    if (activeFilter === 'open') result = result.filter((v) => !v.paid);
    if (activeFilter === 'paid') result = result.filter((v) => v.paid);
    if (activeFilter === 'helpers') result = result.filter((v) => v.isHelper);

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(
        (v) =>
          v.name?.toLowerCase().includes(lowerSearch) ||
          v.email?.toLowerCase().includes(lowerSearch)
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
        toast.success(`${vendor.name} ist kein Helfer mehr`);
      } else {
        await addHelper({ eventId: eId, userId: vendor._id });
        toast.success(`${vendor.name} wurde als Helfer hinzugefügt`);
      }
    } catch (error) {
      toast.error('Aktion fehlgeschlagen', {
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
      });
    } finally {
      setHelperAction(null);
    }
  };

  if (!canManage) return <div className="p-8 text-center">Keine Berechtigung</div>;

  return (
    <div className="container mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Teilnehmer & Helfer</h1>
          <p className="text-muted-foreground text-sm">
            Übersicht aller Verkäufer und Rollen-Management
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Tabs
          value={activeFilter}
          onValueChange={(v) => setActiveFilter(v as SellerFilter)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all">Alle</TabsTrigger>
            <TabsTrigger value="open">Offen</TabsTrigger>
            <TabsTrigger value="paid">Bezahlt</TabsTrigger>
            <TabsTrigger value="helpers">Helfer</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
          <Filter className="h-3 w-3" />
          <span>{filteredVendors.length} Teilnehmer angezeigt</span>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-card border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[300px]">Teilnehmer</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Netto-Umsatz</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Rolle</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredVendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                  Keine Einträge für diesen Filter gefunden
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
                            {v.isHelper && !isOwner && (
                              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground uppercase font-medium truncate">
                            {v.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3" /> {v.email}
                        </div>
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
                          <CheckCircle2 className="h-3 w-3" /> Bezahlt
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1.5 whitespace-nowrap">
                          <DollarSign className="h-3 w-3" /> Offen
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isOwner ? (
                        <Badge variant="default" className="bg-primary hover:bg-primary gap-1">
                          <Crown className="h-3 w-3" /> Inhaber
                        </Badge>
                      ) : isMainOrganizer ? (
                        <Button
                          variant={v.isHelper ? 'secondary' : 'ghost'}
                          size="icon"
                          aria-label={
                            v.isHelper ? 'Helfer-Rechte entziehen' : 'Zum Helfer ernennen'
                          }
                          className={`h-8 w-8 rounded-full ${v.isHelper ? 'text-primary' : 'text-muted-foreground opacity-20 group-hover:opacity-100'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setHelperAction({ mode: v.isHelper ? 'remove' : 'add', vendor: v });
                          }}
                        >
                          {v.isHelper ? (
                            <UserMinus className="h-4 w-4" />
                          ) : (
                            <UserPlus className="h-4 w-4" />
                          )}
                        </Button>
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
            Keine Teilnehmer gefunden
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
                        {isOwner && <Crown className="h-3.5 w-3.5 text-primary" />}
                        {v.isHelper && !isOwner && (
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase">{v.email}</div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Umsatz
                    </div>
                    <div className="font-mono font-bold text-lg">
                      {formatPriceDE(v.totalRevenue)} €
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Status
                    </div>
                    {v.paid ? (
                      <Badge variant="secondary" className="mt-1">
                        Bezahlt
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="mt-1">
                        Offen
                      </Badge>
                    )}
                  </div>
                </div>

                {!isOwner && (
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
                          <UserMinus className="h-4 w-4" /> Helfer-Rechte entziehen
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" /> Zum Helfer ernennen
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

      {/* Helper Confirmation Dialogs */}
      <AlertDialog open={!!helperAction} onOpenChange={(open) => !open && setHelperAction(null)}>
        <AlertDialogContent className="sm:max-w-[450px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {helperAction?.mode === 'add' ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-primary" /> Helfer ernennen
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-destructive" /> Rechte entziehen
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {helperAction?.mode === 'add' ? (
                <>
                  <p>
                    Möchtest du <b>{helperAction.vendor.name}</b> wirklich Helfer-Rechte für dieses
                    Event geben?
                  </p>
                  <div className="bg-muted p-4 rounded-lg space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5" /> Ein Helfer kann:
                    </p>
                    <ul className="text-xs space-y-1.5">
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                        <span>Warenannahme (Check-in) durchführen</span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                        <span>Verkäufe an der Kasse (POS) erfassen</span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                        <span>Abrechnungen & Rückgaben abwickeln</span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                        <span>QR-Codes und Rechnungen drucken</span>
                      </li>
                    </ul>
                  </div>
                  <p className="text-[10px] italic text-muted-foreground">
                    Helfer haben Zugriff auf fast alle operativen Funktionen, können aber keine
                    Basiseinstellungen ändern oder das Event löschen.
                  </p>
                </>
              ) : (
                <p>
                  Möchtest du <b>{helperAction?.vendor.name}</b> die Helfer-Rechte wirklich
                  entziehen? Der Nutzer hat danach nur noch Zugriff auf seine eigenen
                  Verkäufer-Funktionen.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeToggleHelper}
              className={
                helperAction?.mode === 'remove' ? 'bg-destructive hover:bg-destructive/90' : ''
              }
            >
              {helperAction?.mode === 'add' ? 'Als Helfer ernennen' : 'Rechte entziehen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
