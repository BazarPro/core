import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { CheckCircle2, Copy, FileDown, Plus, Trash2 } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { PRODUCT_CONDITIONS, type ProductContitions } from '../../../../convex/constants';
import { getCategoryFields } from '../../../../convex/categoryFields';
import { resolveEventFeatures } from '../../../../convex/eventFeatures';
import { BackButton } from '../../../components/navigation/BackButton';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CONDITION_OPTIONS } from '../../../constants/records';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { downloadLabelsPdf } from '../../../lib/productQRCodePdf';
import { formatPriceDE } from '../../../lib/utils';

interface Row {
  key: number;
  categoryId: string;
  title: string;
  size: string;
  brand: string;
  condition: ProductContitions;
  price: string;
}

let nextKey = 1;
function emptyRow(template?: Row): Row {
  return {
    key: nextKey++,
    categoryId: template?.categoryId ?? '',
    title: '',
    size: template?.size ?? '',
    brand: '',
    condition: template?.condition ?? 'good',
    price: '',
  };
}

function parsePrice(value: string): number {
  return Number(value.replace(',', '.').trim());
}

/** A row the seller has started to fill in; empty rows at the end are ignored. */
function isTouched(row: Row) {
  return row.title.trim() !== '' || row.price.trim() !== '';
}

/**
 * Quick entry for bazaars with many small items: one row per item (category, title,
 * size, brand, condition, price), no photo, saved and announced for the bazaar at once.
 */
export function QuickEntryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const events = useQuery(api.events.getMyRegisteredEvents, {});
  const categories = useQuery(api.categories.getAllCategories);
  const convex = useConvex();
  const addProducts = useMutation(api.products.addProductsToEvent);
  const [eventId, setEventId] = useState<string>(
    (location.state as { eventId?: string } | null)?.eventId ?? ''
  );
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [isSaving, setIsSaving] = useState(false);
  const [created, setCreated] = useState<{ productId: Id<'products'>; title: string }[] | null>(
    null
  );
  const titleInputs = useRef(new Map<number, HTMLInputElement>());
  const focusKey = useRef<number | null>(null);

  // Preselect the first bazaar that allows items without photo
  useEffect(() => {
    if (eventId || !events) return;
    const first = events.find((event) => resolveEventFeatures(event).photosOptional) ?? events[0];
    if (first) setEventId(first._id);
  }, [events, eventId]);

  useEffect(() => {
    if (focusKey.current === null) return;
    titleInputs.current.get(focusKey.current)?.focus();
    focusKey.current = null;
  }, [rows]);

  const event = events?.find((candidate) => candidate._id === eventId);
  const allowed = event ? resolveEventFeatures(event).photosOptional : false;
  const eventCategories = useMemo(() => {
    if (!categories) return [];
    if (!event || event.categories.length === 0) return categories;
    return categories.filter((category) => event.categories.includes(category._id));
  }, [categories, event]);

  const update = (key: number, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const addRow = (template?: Row) => {
    const row = emptyRow(template);
    focusKey.current = row.key;
    setRows((current) => [...current, row]);
  };

  const filled = rows.filter(isTouched);
  const total = filled.reduce((sum, row) => sum + (parsePrice(row.price) || 0), 0);

  const save = async () => {
    if (!event) return;
    setIsSaving(true);
    try {
      const result = await addProducts({
        eventId: event._id,
        items: filled.map((row) => {
          const fields = getCategoryFields(row.categoryId, categories);
          const attributes: Record<string, string> = {};
          if (row.size.trim() && fields.some((field) => field.key === 'size')) {
            attributes.size = row.size.trim();
          }
          if (row.brand.trim() && fields.some((field) => field.key === 'brand')) {
            attributes.brand = row.brand.trim();
          }
          return {
            title: row.title,
            productCategory: row.categoryId as Id<'categories'>,
            condition: row.condition,
            price: parsePrice(row.price),
            attributes,
          };
        }),
      });
      setCreated(result);
      setRows([emptyRow()]);
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (created) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-5 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{created.length} Artikel angelegt</p>
            <p className="text-sm">
              Sie sind für „{event?.title}“ angemeldet. Drucke jetzt die Etiketten und befestige sie
              an den Teilen.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              downloadLabelsPdf(
                convex,
                created.map((item) => item.productId),
                event?._id
              ).catch((error) => toast.error(getUserFacingErrorMessage(error)))
            }
          >
            <FileDown className="mr-2 h-4 w-4" /> Etiketten als PDF
          </Button>
          <Button variant="outline" onClick={() => setCreated(null)}>
            Weitere Artikel erfassen
          </Button>
          <Button variant="ghost" onClick={() => navigate('/my-products')}>
            Zu meinen Produkten
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackButton variant="ghost" fallbackPath="/my-products" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schnellerfassung</h1>
        <p className="mt-1 text-muted-foreground">
          Viele Artikel ohne Foto auf einmal anlegen – eine Zeile pro Teil. Mit Enter im Preisfeld
          geht es zur nächsten Zeile.
        </p>
      </div>

      <div className="max-w-md space-y-2">
        <Label htmlFor="quick-event">Für welchen Basar?</Label>
        <select
          id="quick-event"
          className="w-full rounded-md border bg-background px-3 py-2"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          {events?.length === 0 && <option value="">Du bist bei keinem Basar angemeldet</option>}
          {events?.map((candidate: Doc<'events'>) => (
            <option key={candidate._id} value={candidate._id}>
              {candidate.title}
            </option>
          ))}
        </select>
      </div>

      {event && !allowed ? (
        <Alert>
          <AlertDescription>
            Bei „{event.title}“ braucht jeder Artikel ein Foto. Lege die Artikel bitte einzeln über{' '}
            <button
              type="button"
              className="text-primary underline"
              onClick={() => navigate('/products/new', { state: { initialEventId: event._id } })}
            >
              Neues Produkt
            </button>{' '}
            an.
          </AlertDescription>
        </Alert>
      ) : (
        event && (
          <>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Kategorie</th>
                    <th className="p-2 font-medium">Titel</th>
                    <th className="w-28 p-2 font-medium">Größe</th>
                    <th className="w-32 p-2 font-medium">Marke</th>
                    <th className="w-36 p-2 font-medium">Zustand</th>
                    <th className="w-28 p-2 font-medium">Preis (€)</th>
                    <th className="w-20 p-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const fields = getCategoryFields(row.categoryId, categories);
                    const hasSize = fields.some((field) => field.key === 'size');
                    const hasBrand = fields.some((field) => field.key === 'brand');
                    return (
                      <tr
                        key={row.key}
                        className="border-b last:border-b-0"
                        data-testid="quick-row"
                      >
                        <td className="p-2">
                          <select
                            aria-label={`Kategorie Zeile ${index + 1}`}
                            className="w-full rounded-md border bg-background px-2 py-1.5"
                            value={row.categoryId}
                            onChange={(e) => update(row.key, { categoryId: e.target.value })}
                          >
                            <option value="">Bitte wählen</option>
                            {eventCategories.map((category) => (
                              <option key={category._id} value={category._id}>
                                {category.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <Input
                            ref={(element) => {
                              if (element) titleInputs.current.set(row.key, element);
                              else titleInputs.current.delete(row.key);
                            }}
                            aria-label={`Titel Zeile ${index + 1}`}
                            value={row.title}
                            placeholder="z. B. Regenjacke blau"
                            onChange={(e) => update(row.key, { title: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            aria-label={`Größe Zeile ${index + 1}`}
                            value={row.size}
                            disabled={!hasSize}
                            placeholder={hasSize ? 'z. B. 104' : '–'}
                            onChange={(e) => update(row.key, { size: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            aria-label={`Marke Zeile ${index + 1}`}
                            value={row.brand}
                            disabled={!hasBrand}
                            placeholder={hasBrand ? 'optional' : '–'}
                            onChange={(e) => update(row.key, { brand: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <select
                            aria-label={`Zustand Zeile ${index + 1}`}
                            className="w-full rounded-md border bg-background px-2 py-1.5"
                            value={row.condition}
                            onChange={(e) =>
                              update(row.key, { condition: e.target.value as ProductContitions })
                            }
                          >
                            {PRODUCT_CONDITIONS.map((condition) => (
                              <option key={condition} value={condition}>
                                {CONDITION_OPTIONS[condition].title}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <Input
                            aria-label={`Preis Zeile ${index + 1}`}
                            inputMode="decimal"
                            value={row.price}
                            placeholder="0,00"
                            onChange={(e) => update(row.key, { price: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && index === rows.length - 1) {
                                e.preventDefault();
                                addRow(row);
                              }
                            }}
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Neue Zeile wie diese"
                              aria-label={`Wie Zeile ${index + 1}`}
                              onClick={() => addRow(row)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Zeile ${index + 1} löschen`}
                              disabled={rows.length === 1}
                              onClick={() =>
                                setRows((current) => current.filter((item) => item.key !== row.key))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => addRow(rows[rows.length - 1])}>
                <Plus className="mr-2 h-4 w-4" /> Zeile hinzufügen
              </Button>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {filled.length} Artikel · zusammen {formatPriceDE(total)} €
                </span>
                <Button onClick={save} disabled={filled.length === 0 || isSaving}>
                  {isSaving ? 'Wird gespeichert…' : `${filled.length} Artikel anlegen`}
                </Button>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
