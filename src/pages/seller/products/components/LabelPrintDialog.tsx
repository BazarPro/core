import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog';
import { Button } from '../../../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { useApiClient } from '../../../../lib/api/react';
import type { Doc, Id } from '../../../../lib/api/types';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { LABEL_LAYOUTS, downloadLabelsPdf } from '../../../../lib/productQRCodePdf';
import { formatDateDE } from '../../../../lib/utils';

/** Without a bazaar: all available items, each on the sheet of its next bazaar */
const ALL = 'all';

type LabelProduct = { _id: Id<'products'>; eventIds?: string[]; sold?: boolean };

interface LabelPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The bazaars the seller is registered for */
  events: Doc<'events'>[];
  products: LabelProduct[];
  /** Preselected bazaar, e.g. the one the list is filtered by */
  eventId?: string;
}

/** Labels for all unsold items of a bazaar, in that bazaar's format; no selection needed. */
export function LabelPrintDialog({
  open,
  onOpenChange,
  events,
  products,
  eventId,
}: LabelPrintDialogProps) {
  const { t } = useTranslation('seller');
  const client = useApiClient();
  const [choice, setChoice] = useState<string>(ALL);
  const [isCreating, setIsCreating] = useState(false);

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
  }, [open, eventId, bazaars]);

  const bazaar = bazaars.find((entry) => entry.event._id === choice);
  const ids = bazaar ? bazaar.ids : available.map((p) => p._id);
  const format = bazaar?.event.features?.labelFormat ?? 'standard';
  const { cols, rows } = LABEL_LAYOUTS[format];
  const pages = Math.ceil(ids.length / (cols * rows));

  const create = async () => {
    setIsCreating(true);
    try {
      const count = await downloadLabelsPdf(client, ids, bazaar?.event._id);
      toast.success(t('labels.created', { count }));
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

          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
            <p className="font-medium">{t('labels.summary', { count: ids.length, pages })}</p>
            <p className="text-muted-foreground">
              {bazaar
                ? t(format === 'small' ? 'labels.formatSmall' : 'labels.formatStandard', {
                    perPage: cols * rows,
                  })
                : t('labels.formatPerItem')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button onClick={() => void create()} disabled={isCreating || ids.length === 0}>
            <Printer className="mr-2 h-4 w-4" />
            {isCreating ? t('myProducts.pdfCreating') : t('labels.download')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
