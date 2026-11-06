import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useApiClient, useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Doc, Id } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { LABEL_LAYOUTS, downloadLabelsPdf } from '../../lib/productQRCodePdf';
import { formatDateDE } from '../../lib/utils';
import { resolveEventFeatures } from '../../shared/eventFeatures';

/** Without a bazaar: all available items, each on the sheet of its next bazaar */
const ALL = 'all';
const MAX_FORMAT_LOOKUP = 500;
const NO_EVENTS: Doc<'events'>[] = [];
const NO_PRODUCTS: LabelProduct[] = [];

type LabelProduct = { _id: Id<'products'>; eventIds?: string[]; sold?: boolean };

interface LabelPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The bazaars the seller is registered for */
  events?: Doc<'events'>[];
  products?: LabelProduct[];
  /** Preselected bazaar, or the bazaar of `selection` */
  eventId?: string;
  /** Print exactly these items, without choosing a bazaar */
  selection?: Id<'products'>[];
  /** Tells the caller how many labels were made */
  onCreated?: (count: number) => void;
}

/**
 * The one dialog for printing labels. Sellers choose a bazaar and get all its unsold items, or
 * `selection` prints given items. Always with the first free place on the sheet (#238).
 */
export function LabelPrintDialog({
  open,
  onOpenChange,
  events = NO_EVENTS,
  products = NO_PRODUCTS,
  eventId,
  selection,
  onCreated,
}: LabelPrintDialogProps) {
  const { t } = useTranslation('seller');
  const client = useApiClient();
  const [choice, setChoice] = useState<string>(ALL);
  const [isCreating, setIsCreating] = useState(false);
  const [startInput, setStartInput] = useState('1');

  const available = useMemo(() => products.filter((p) => !p.sold), [products]);

  // Bazaars that are not over yet and have items to label, the next one first
  const bazaars = useMemo(() => {
    const now = Date.now();
    return events
      .filter((event) => event.endDate >= now)
      .map((event) => ({
        event,
        ids: available.filter((p) => p.eventIds?.includes(event._id)).map((p) => p._id),
      }))
      .filter((bazaar) => bazaar.ids.length > 0)
      .sort((a, b) => a.event.startDate - b.event.startDate);
  }, [events, available]);

  useEffect(() => {
    if (!open) return;
    const preselected = bazaars.find((bazaar) => bazaar.event._id === eventId);
    setChoice(preselected?.event._id ?? bazaars[0]?.event._id ?? ALL);
    setStartInput('1');
  }, [open, eventId, bazaars]);

  const bazaar = selection ? undefined : bazaars.find((entry) => entry.event._id === choice);
  const ids = selection ?? (bazaar ? bazaar.ids : available.map((p) => p._id));
  const targetEvent = bazaar?.event._id ?? (selection ? (eventId as Id<'events'>) : undefined);

  // Without a chosen bazaar the backend knows the sheet; the first page of items tells it
  const loaded = useQuery(
    api.labels.getLabelData,
    open && !bazaar && ids.length > 0
      ? { productIds: ids.slice(0, MAX_FORMAT_LOOKUP), eventId: targetEvent }
      : 'skip'
  );
  const format = bazaar?.event.features?.labelFormat ?? loaded?.format ?? 'standard';
  const { cols, rows } = LABEL_LAYOUTS[format];
  const perPage = cols * rows;
  const startAt = Math.min(Math.max(Math.trunc(Number(startInput)) || 1, 1), perPage);
  const pages = Math.ceil((ids.length + startAt - 1) / perPage);
  const mark = bazaar && resolveEventFeatures(bazaar.event).labelMark;

  // Another seller of this bazaar has the same pattern, the labels differ by the extra letter only
  const clashes = useQuery(
    api.labels.getSortMarkClashes,
    open && targetEvent ? { eventIds: [targetEvent] } : 'skip'
  );
  const clash = !!targetEvent && !!clashes?.includes(targetEvent);

  const create = async () => {
    setIsCreating(true);
    try {
      const count = await downloadLabelsPdf(client, ids, targetEvent, startAt);
      toast.success(t('labels.created', { count }));
      onCreated?.(count);
      onOpenChange(false);
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('labels.title')}</DialogTitle>
          <DialogDescription>{t('labels.text')}</DialogDescription>
        </DialogHeader>

        {/* min-w-0: long bazaar titles must not widen the dialog beyond the screen */}
        <div className="min-w-0 space-y-4">
          {!selection && (
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger
                aria-label={t('labels.bazaar')}
                className="w-full min-w-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                {bazaars.map(({ event }) => (
                  <SelectItem key={event._id} value={event._id} className="whitespace-normal">
                    {event.title} · {formatDateDE(event.startDate)}
                  </SelectItem>
                ))}
                <SelectItem value={ALL}>{t('labels.allAvailable')}</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
            <p className="font-medium">{t('labels.summary', { count: ids.length, pages })}</p>
            <p className="text-muted-foreground">
              {t(format === 'small' ? 'labels.formatSmall' : 'labels.formatStandard', { perPage })}
            </p>
            {mark === 'universal' && (
              <p className="text-muted-foreground">{t('labels.reusableUniversal')}</p>
            )}
            {mark === 'none' && <p className="text-muted-foreground">{t('labels.reusable')}</p>}
          </div>

          {clash && (
            <p
              role="alert"
              className="flex gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              {t('labels.clash')}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="label-start">{t('labels.startAt')}</Label>
            <Input
              id="label-start"
              type="number"
              inputMode="numeric"
              min={1}
              max={perPage}
              className="max-w-24"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('labels.startAtHint', { perPage })}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button
            loading={isCreating}
            onClick={() => void create()}
            disabled={isCreating || ids.length === 0}
          >
            <Printer className="mr-2 h-4 w-4" />
            {isCreating ? t('myProducts.pdfCreating') : t('labels.download')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
