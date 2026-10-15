import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import {
  Camera,
  CheckCircle2,
  Copy,
  FileDown,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
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
import { shrinkImage } from '../../../lib/imageResize';
import { downloadLabelsPdf } from '../../../lib/productQRCodePdf';
import { formatPriceDE } from '../../../lib/utils';
import { ExistingItemsPicker } from './components/ExistingItemsPicker';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';

interface Photo {
  preview: string;
  storageId?: Id<'_storage'>;
}

interface Row {
  key: number;
  categoryId: string;
  title: string;
  size: string;
  brand: string;
  condition: ProductContitions;
  price: string;
  photo?: Photo;
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
  return row.title.trim() !== '' || row.price.trim() !== '' || !!row.photo;
}

const SELECT_CLASS = 'w-full rounded-md border bg-background px-2 py-1.5 text-sm';
/** Same columns for the header and the rows on larger screens */
const FIELDS_GRID =
  'grid flex-1 grid-cols-2 gap-2 md:grid-cols-[minmax(8rem,1fr)_minmax(10rem,1.6fr)_5.5rem_7rem_8.5rem_6rem]';

/**
 * Quick entry for bazaars with many small items: one row per item (category, title,
 * size, brand, condition, price), saved and announced for the bazaar at once. On the
 * phone, items are photographed one after the other; each photo starts a new row.
 */
export function QuickEntryPage() {
  const { t } = useTranslation('seller');
  const navigate = useNavigate();
  const location = useLocation();
  const events = useQuery(api.events.getMyRegisteredEvents, {});
  const categories = useQuery(api.categories.getAllCategories);
  const convex = useConvex();
  const addProducts = useMutation(api.products.addProductsToEvent);
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
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
  const photosRequired = event ? !resolveEventFeatures(event).photosOptional : false;
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

  /** Shows the photo right away and uploads it in the background. */
  const uploadPhoto = async (key: number, file: File) => {
    const preview = URL.createObjectURL(file);
    update(key, { photo: { preview } });
    try {
      const image = await shrinkImage(file);
      const result = await fetch(await generateUploadUrl(), {
        method: 'POST',
        headers: { 'Content-Type': image.type || file.type },
        body: image,
      });
      if (!result.ok) throw new Error(t('quick.uploadFailed'));
      const { storageId } = (await result.json()) as { storageId: Id<'_storage'> };
      setRows((current) =>
        current.map((row) =>
          row.key === key && row.photo?.preview === preview
            ? { ...row, photo: { preview, storageId } }
            : row
        )
      );
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
      setRows((current) =>
        current.map((row) =>
          row.key === key && row.photo?.preview === preview ? { ...row, photo: undefined } : row
        )
      );
    }
  };

  /** Serial capture: every photo becomes a row (the empty last row is used first). */
  const addPhotoRows = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const last = rows[rows.length - 1];
    const reuseLast = last && !isTouched(last);
    const targets = [...files].map((_, index) =>
      index === 0 && reuseLast ? last : emptyRow(last)
    );
    focusKey.current = targets[0].key;
    setRows((current) => [
      ...current,
      ...targets.filter((row) => !(reuseLast && row.key === last.key)),
    ]);
    [...files].forEach((file, index) => void uploadPhoto(targets[index].key, file));
  };

  const filled = rows.filter(isTouched);
  const total = filled.reduce((sum, row) => sum + (parsePrice(row.price) || 0), 0);
  const uploading = filled.some((row) => row.photo && !row.photo.storageId);
  const withoutPhoto = photosRequired ? filled.filter((row) => !row.photo).length : 0;

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
            ...(row.photo?.storageId ? { images: [row.photo.storageId] } : {}),
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
            <p className="font-semibold">{t('quick.created', { count: created.length })}</p>
            <p className="text-sm">{t('quick.createdHint', { event: event?.title })}</p>
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
            <FileDown className="mr-2 h-4 w-4" /> {t('quick.labels')}
          </Button>
          <Button variant="outline" onClick={() => setCreated(null)}>
            {t('quick.more')}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/my-products')}>
            {t('quick.toProducts')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackButton variant="ghost" fallbackPath="/my-products" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('quick.title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('quick.intro')}</p>
      </div>

      <div className="max-w-md space-y-2">
        <Label htmlFor="quick-event">{t('quick.whichBazaar')}</Label>
        <select
          id="quick-event"
          className="w-full rounded-md border bg-background px-3 py-2"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          {events?.length === 0 && <option value="">{t('quick.noBazaar')}</option>}
          {events?.map((candidate: Doc<'events'>) => (
            <option key={candidate._id} value={candidate._id}>
              {candidate.title}
            </option>
          ))}
        </select>
      </div>

      {event && (
        <>
          {photosRequired && (
            <Alert>
              <AlertDescription>
                {t('quick.photosRequired', { event: event.title })}
              </AlertDescription>
            </Alert>
          )}

          <ExistingItemsPicker event={event} photosRequired={photosRequired} />

          <div className="space-y-2 md:space-y-0 md:rounded-xl md:border md:bg-card">
            <div className="hidden gap-3 border-b bg-muted/40 p-2 text-xs font-medium text-muted-foreground md:flex">
              <span className="w-14 shrink-0">{t('quick.photo')}</span>
              <div className={FIELDS_GRID}>
                <span>{t('quick.category')}</span>
                <span>{t('quick.titleColumn')}</span>
                <span>{t('quick.size')}</span>
                <span>{t('quick.brand')}</span>
                <span>{t('quick.condition')}</span>
                <span>{t('quick.price')}</span>
              </div>
              <span className="w-20 shrink-0" />
            </div>
            {rows.map((row, index) => {
              const fields = getCategoryFields(row.categoryId, categories);
              const hasSize = fields.some((field) => field.key === 'size');
              const hasBrand = fields.some((field) => field.key === 'brand');
              const missingPhoto = photosRequired && isTouched(row) && !row.photo;
              return (
                <div
                  key={row.key}
                  className="flex gap-3 rounded-xl border bg-card p-3 md:items-center md:rounded-none md:border-0 md:border-b md:p-2 md:last:border-b-0"
                  data-testid="quick-row"
                >
                  <PhotoCell
                    row={index + 1}
                    photo={row.photo}
                    missing={missingPhoto}
                    onPick={(file) => void uploadPhoto(row.key, file)}
                    onRemove={() => update(row.key, { photo: undefined })}
                  />
                  <div className={FIELDS_GRID}>
                    <select
                      aria-label={t('quick.rowCategory', { row: index + 1 })}
                      className={`${SELECT_CLASS} col-span-2 md:col-span-1`}
                      value={row.categoryId}
                      onChange={(e) => update(row.key, { categoryId: e.target.value })}
                    >
                      <option value="">{t('quick.chooseCategory')}</option>
                      {eventCategories.map((category) => (
                        <option key={category._id} value={category._id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      ref={(element) => {
                        if (element) titleInputs.current.set(row.key, element);
                        else titleInputs.current.delete(row.key);
                      }}
                      className="col-span-2 md:col-span-1"
                      aria-label={t('quick.rowTitle', { row: index + 1 })}
                      value={row.title}
                      placeholder={t('quick.titlePlaceholder')}
                      onChange={(e) => update(row.key, { title: e.target.value })}
                    />
                    <Input
                      aria-label={t('quick.rowSize', { row: index + 1 })}
                      value={row.size}
                      disabled={!hasSize}
                      placeholder={hasSize ? t('quick.size') : '–'}
                      onChange={(e) => update(row.key, { size: e.target.value })}
                    />
                    <Input
                      aria-label={t('quick.rowBrand', { row: index + 1 })}
                      value={row.brand}
                      disabled={!hasBrand}
                      placeholder={hasBrand ? t('quick.brand') : '–'}
                      onChange={(e) => update(row.key, { brand: e.target.value })}
                    />
                    <select
                      aria-label={t('quick.rowCondition', { row: index + 1 })}
                      className={SELECT_CLASS}
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
                    <Input
                      aria-label={t('quick.rowPrice', { row: index + 1 })}
                      inputMode="decimal"
                      value={row.price}
                      placeholder={t('quick.pricePlaceholder')}
                      onChange={(e) => update(row.key, { price: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && index === rows.length - 1) {
                          e.preventDefault();
                          addRow(row);
                        }
                      }}
                    />
                  </div>
                  <div className="flex w-10 shrink-0 flex-col md:w-20 md:flex-row md:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={t('quick.likeRowTitle')}
                      aria-label={t('quick.likeRow', { row: index + 1 })}
                      onClick={() => addRow(row)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('quick.deleteRow', { row: index + 1 })}
                      disabled={rows.length === 1}
                      onClick={() =>
                        setRows((current) => current.filter((item) => item.key !== row.key))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {/* Opens the camera on the phone; each photo starts the next row */}
              <FilePicker
                label={t('quick.takePhoto')}
                capture
                onFiles={addPhotoRows}
                icon={<Camera className="mr-2 h-4 w-4" />}
                primary
              />
              <FilePicker
                label={t('quick.choosePhotos')}
                multiple
                onFiles={addPhotoRows}
                icon={<ImagePlus className="mr-2 h-4 w-4" />}
              />
              <Button type="button" variant="outline" onClick={() => addRow(rows[rows.length - 1])}>
                <Plus className="mr-2 h-4 w-4" /> {t('quick.addRow')}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {t('quick.summary', { count: filled.length, total: formatPriceDE(total) })}
                {withoutPhoto > 0 && t('quick.withoutPhoto', { count: withoutPhoto })}
              </span>
              <Button
                onClick={save}
                disabled={filled.length === 0 || isSaving || uploading || withoutPhoto > 0}
              >
                {isSaving
                  ? t('quick.saving')
                  : uploading
                    ? t('quick.uploading')
                    : t('quick.create', { count: filled.length })}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Button that opens the camera or the photo library. */
function FilePicker({
  label,
  icon,
  capture,
  multiple,
  primary,
  onFiles,
}: {
  label: string;
  icon: ReactNode;
  capture?: boolean;
  multiple?: boolean;
  primary?: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={label}
        capture={capture ? 'environment' : undefined}
        multiple={multiple}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant={primary ? 'default' : 'outline'}
        onClick={() => input.current?.click()}
      >
        {icon}
        {label}
      </Button>
    </>
  );
}

/** Thumbnail of the row's photo, or a camera button to take one. */
function PhotoCell({
  row,
  photo,
  missing,
  onPick,
  onRemove,
}: {
  row: number;
  photo?: Photo;
  missing: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  if (photo) {
    return (
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        <img
          src={photo.preview}
          alt={i18n.t('quick.rowPhoto', { ns: 'seller', row })}
          className="h-full w-full object-cover"
        />
        {!photo.storageId && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        <button
          type="button"
          aria-label={i18n.t('quick.removePhoto', { ns: 'seller', row })}
          className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5"
          onClick={onRemove}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }
  return (
    <label
      className={`flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:bg-muted ${missing ? 'border-destructive text-destructive' : ''}`}
      title={i18n.t('quick.shootPhoto', { ns: 'seller' })}
    >
      <Camera className="h-5 w-5" />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={i18n.t('quick.rowPhoto', { ns: 'seller', row })}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />
    </label>
  );
}
