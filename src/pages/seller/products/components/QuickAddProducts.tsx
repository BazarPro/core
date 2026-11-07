import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Camera, ChevronRight, Loader2, Minus, Plus, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useApiClient, useMutation } from '../../../../lib/api/react';
import { api } from '../../../../lib/api/functions';
import type { Doc, Id } from '../../../../lib/api/types';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { NativeSelect } from '../../../../components/ui/native-select';
import { FieldError } from '../../../../components/ui/field-error';
import { CONDITION_OPTIONS } from '../../../../constants/records';
import { PRODUCT_CONDITIONS, type ProductContitions } from '../../../../shared/constants';
import { categoryName } from '../../../../i18n/categories';
import { categoryFieldText } from '../../../../i18n/categoryFields';
import { uploadImages } from '../../../../lib/uploadImages';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { cn, formatPriceDE } from '../../../../lib/utils';
import {
  loadQuickAddDefaults,
  MAX_COPIES,
  parsePriceInput,
  pickQuickAddEvent,
  quickAddBlocker,
  quickSizeField,
  saveQuickAddDefaults,
} from '../../../../lib/quickAdd';
import { fieldMaxLength } from '../../../../shared/categoryFields';
import { resolveEventFeatures } from '../../../../shared/eventFeatures';

type Category = Doc<'categories'>;
type Bazaar = {
  _id: Id<'events'>;
  title: string;
  endDate: number;
  features?: Doc<'events'>['features'];
};

/** What the full form takes over when the seller needs more than title and price. */
export interface QuickAddDraft {
  title: string;
  price?: number;
  categoryId: string;
  condition: ProductContitions;
  eventIds: string[];
}

/**
 * Enters items one after another with just title and price: category, condition and
 * bazaar are set once above and kept. A count above one creates that many equal items,
 * each with its own label. A photo is optional unless the bazaar asks for one.
 */
export function QuickAddProducts({
  vendorId,
  categories,
  events,
  filterEvent,
  onClose,
  onOpenForm,
}: {
  vendorId: Id<'users'>;
  categories: Category[];
  events: Bazaar[];
  /** The bazaar the list is filtered by; new items go there */
  filterEvent?: string;
  onClose: () => void;
  onOpenForm: (draft: QuickAddDraft) => void;
}) {
  const { t } = useTranslation('seller');
  const client = useApiClient();
  const addProduct = useMutation(api.products.addProduct);
  const setProductEvents = useMutation(api.eventProducts.setProductEvents);
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const deleteProducts = useMutation(api.products.deleteProducts);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return events.filter((event) => event.endDate >= now);
  }, [events]);

  const [defaults] = useState(loadQuickAddDefaults);
  const [categoryId, setCategoryId] = useState(() =>
    categories.some((c) => c._id === defaults.categoryId) ? defaults.categoryId! : ''
  );
  const [condition, setCondition] = useState<ProductContitions>(defaults.condition ?? 'very-good');
  const [eventId, setEventId] = useState(() =>
    pickQuickAddEvent(upcoming, filterEvent, defaults.eventId)
  );
  // Follow the filter: whoever filters by a bazaar adds items for it
  useEffect(() => {
    if (filterEvent && upcoming.some((event) => event._id === filterEvent)) {
      setEventId(filterEvent);
    }
  }, [filterEvent, upcoming]);

  const [title, setTitle] = useState('');
  const [priceText, setPriceText] = useState('');
  const [size, setSize] = useState('');
  const [count, setCount] = useState(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<'title' | 'price' | 'category' | 'photo' | 'size', string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const sizeRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const event = upcoming.find((candidate) => candidate._id === eventId);
  // Clothes, shoes, sports: the size goes on the label, so it is asked for right here
  const sizeField = quickSizeField(categoryId, categories);
  const sizeRequired =
    !!sizeField && !!event && !!resolveEventFeatures(event).requiredFields?.includes('size');
  const blocker = quickAddBlocker(
    event,
    categoryId,
    categories,
    !!photo,
    sizeField ? ['size'] : []
  );
  const fieldBlocker = blocker?.kind === 'field' ? blocker : null;
  const photoNeeded =
    !!event && quickAddBlocker(event, categoryId, categories, false)?.kind === 'photo';
  const price = parsePriceInput(priceText);

  const draft = (): QuickAddDraft => ({
    title: title.trim(),
    price: price ?? undefined,
    categoryId,
    condition,
    eventIds: eventId ? [eventId] : [],
  });

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const next: typeof errors = {};
    if (title.trim().length < 3) next.title = t('form.titleTooShort');
    if (price === null)
      next.price = priceText.trim() ? t('quick.priceInvalid') : t('quick.priceMissing');
    if (!categoryId) next.category = t('form.categoryRequired');
    if (sizeRequired && !size.trim()) next.size = t('quick.sizeNeeded', { event: event?.title });
    if (blocker?.kind === 'photo') next.photo = t('quick.photoNeeded', { event: event?.title });
    setErrors(next);
    if (Object.keys(next).length > 0 || fieldBlocker || price === null) {
      if (next.title) titleRef.current?.focus();
      else if (next.size) sizeRef.current?.focus();
      else if (next.price) priceRef.current?.focus();
      return;
    }

    setSaving(true);
    const ids: Id<'products'>[] = [];
    const name = title.trim();
    try {
      // One upload, shared by all copies: they show the same item
      const images = photo ? await uploadImages(client, [photo], generateUploadUrl) : [];
      for (let i = 0; i < count; i++) {
        ids.push(
          await addProduct({
            title: name,
            vendorId,
            description: '',
            condition,
            images,
            productCategory: categoryId as Id<'categories'>,
            price,
            readyForSale: true,
            sold: false,
            attributes: sizeField && size.trim() ? { size: size.trim() } : undefined,
          })
        );
      }
      if (eventId) {
        for (const productId of ids) {
          await setProductEvents({ productId, eventIds: [eventId as Id<'events'>] });
        }
      }
      saveQuickAddDefaults({ categoryId, condition, eventId });
      setCreated((n) => n + ids.length);
      toast.success(
        count > 1
          ? t('quick.createdMany', { count, title: name })
          : t('quick.created', { title: name }),
        {
          action: {
            label: t('quick.undo'),
            onClick: () =>
              void deleteProducts({ ids }).catch((error: unknown) =>
                toast.error(getUserFacingErrorMessage(error))
              ),
          },
        }
      );
      setTitle('');
      setPriceText('');
      setSize('');
      setCount(1);
      setPhoto(null);
      setErrors({});
      titleRef.current?.focus();
    } catch (error) {
      toast.error(
        ids.length > 0 ? t('quick.partlyCreated', { count: ids.length }) : t('form.saveFailed'),
        { description: getUserFacingErrorMessage(error) }
      );
    } finally {
      setSaving(false);
    }
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter after the title goes on to the price, unless it is there already
    if (e.key === 'Enter' && price === null) {
      e.preventDefault();
      (sizeField && !size ? sizeRef : priceRef).current?.focus();
    }
  };

  const label = 'text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground';

  return (
    <section
      aria-labelledby="quick-add-title"
      className="mb-6 overflow-hidden rounded-xl border border-primary/25 bg-card shadow-sm"
    >
      <div className="flex items-start gap-3 border-b bg-gradient-to-r from-primary/[0.07] to-transparent px-4 py-3 sm:px-5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="quick-add-title" className="font-semibold leading-tight">
            {t('quick.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('quick.intro')}</p>
        </div>
        {created > 0 && (
          <span className="hidden whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 sm:inline dark:bg-emerald-900 dark:text-emerald-100">
            {t('quick.session', { count: created })}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 size-8"
          onClick={onClose}
          aria-label={t('quick.close')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={submit} className="space-y-4 px-4 py-4 sm:px-5">
        {/* Shared by all items entered below */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="col-span-2 space-y-1 md:col-span-1">
            <label htmlFor="quick-category" className={label}>
              {t('quick.category')}
            </label>
            <NativeSelect
              id="quick-category"
              value={categoryId}
              aria-invalid={!!errors.category}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setErrors((prev) => ({ ...prev, category: undefined }));
              }}
            >
              <option value="" disabled>
                {t('form.chooseCategory')}
              </option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {categoryName(category)}
                </option>
              ))}
            </NativeSelect>
            {errors.category && <FieldError>{errors.category}</FieldError>}
          </div>
          <div className="space-y-1">
            <label htmlFor="quick-condition" className={label}>
              {t('quick.condition')}
            </label>
            <NativeSelect
              id="quick-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value as ProductContitions)}
            >
              {PRODUCT_CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {CONDITION_OPTIONS[value].title}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <label htmlFor="quick-event" className={label}>
              {t('quick.event')}
            </label>
            <NativeSelect
              id="quick-event"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">{t('quick.noEvent')}</option>
              {upcoming.map((bazaar) => (
                <option key={bazaar._id} value={bazaar._id}>
                  {bazaar.title}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {/* One item per line: title, price, how many */}
        <div
          className={cn(
            'grid grid-cols-[auto_1fr] items-start gap-2',
            sizeField
              ? 'sm:grid-cols-[auto_minmax(0,1fr)_6rem_7rem_auto_auto]'
              : 'sm:grid-cols-[auto_minmax(0,1fr)_8rem_auto_auto]'
          )}
        >
          <div className="row-span-2 sm:row-span-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                setPhoto(e.target.files?.[0] ?? null);
                setErrors((prev) => ({ ...prev, photo: undefined }));
                e.target.value = '';
              }}
            />
            {photoUrl ? (
              <div className="relative h-[5.25rem] w-14 sm:h-9 sm:w-9">
                <img
                  src={photoUrl}
                  alt={t('quick.photo')}
                  className="h-full w-full rounded-md border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  aria-label={t('quick.removePhoto')}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                aria-label={t('quick.addPhoto')}
                title={
                  photoNeeded
                    ? t('quick.photoNeeded', { event: event?.title })
                    : t('quick.addPhoto')
                }
                className={cn(
                  'h-[5.25rem] w-14 flex-col gap-1 px-0 text-[0.65rem] text-muted-foreground sm:h-9 sm:w-9',
                  (photoNeeded || errors.photo) && 'border-primary text-primary',
                  errors.photo && 'border-destructive text-destructive'
                )}
              >
                <Camera className="h-4 w-4" />
                <span className="sm:hidden">{t('quick.photoShort')}</span>
              </Button>
            )}
          </div>
          <div className="min-w-0">
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              onKeyDown={onTitleKey}
              placeholder={t('quick.titlePlaceholder')}
              aria-label={t('quick.titleLabel')}
              aria-invalid={!!errors.title}
              enterKeyHint="next"
              autoComplete="off"
            />
          </div>
          <div
            className={cn(
              'col-start-2 grid gap-2 sm:col-start-auto sm:contents',
              sizeField ? 'grid-cols-[5rem_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'
            )}
          >
            {sizeField && (
              <Input
                ref={sizeRef}
                value={size}
                onChange={(e) => {
                  setSize(e.target.value);
                  if (errors.size) setErrors((prev) => ({ ...prev, size: undefined }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && price === null) {
                    e.preventDefault();
                    priceRef.current?.focus();
                  }
                }}
                maxLength={fieldMaxLength(sizeField)}
                placeholder={t('quick.size')}
                aria-label={categoryFieldText(sizeField, 'label') ?? sizeField.label}
                title={categoryFieldText(sizeField, 'placeholder') ?? sizeField.placeholder}
                aria-invalid={!!errors.size}
                enterKeyHint="next"
                autoComplete="off"
              />
            )}
            <div className="relative">
              <Input
                ref={priceRef}
                value={priceText}
                onChange={(e) => {
                  setPriceText(e.target.value);
                  if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
                }}
                inputMode="decimal"
                placeholder={t('quick.pricePlaceholder')}
                aria-label={t('quick.priceLabel')}
                aria-invalid={!!errors.price}
                enterKeyHint="done"
                autoComplete="off"
                className="pr-7 text-right tabular-nums"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                €
              </span>
            </div>
            <Stepper value={count} onChange={setCount} />
          </div>
          {/* Full width under the fields on phones, at the end of the line above */}
          <Button
            type="submit"
            disabled={saving || !!fieldBlocker}
            className="col-span-2 h-10 sm:col-span-1 sm:h-9 sm:w-36"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {count > 1 ? t('quick.addMany', { count }) : t('quick.add')}
          </Button>
        </div>

        {(errors.title || errors.size || errors.price || errors.photo) && (
          <FieldError>{errors.title ?? errors.size ?? errors.price ?? errors.photo}</FieldError>
        )}

        <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            {fieldBlocker ? (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {t('quick.fieldNeeded', {
                  event: event?.title,
                  field: categoryFieldText(fieldBlocker.field, 'label') ?? fieldBlocker.field.label,
                })}
              </span>
            ) : count > 1 ? (
              t('quick.copiesHint', {
                count,
                total: price !== null ? `${formatPriceDE(price * count)} €` : '–',
              })
            ) : photoNeeded ? (
              t('quick.photoNeeded', { event: event?.title })
            ) : (
              t('quick.keys')
            )}
          </p>
          <button
            type="button"
            onClick={() => onOpenForm(draft())}
            className={cn(
              'inline-flex items-center gap-0.5 self-start whitespace-nowrap font-medium text-primary hover:underline sm:self-auto',
              fieldBlocker &&
                'rounded-md bg-primary px-2.5 py-1 text-primary-foreground hover:no-underline'
            )}
          >
            {t('quick.moreDetails')}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </section>
  );
}

/** How many equal items: − 1 + */
function Stepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useTranslation('seller');
  return (
    <div
      className="flex h-9 items-center rounded-md border bg-input-background dark:bg-input/30"
      role="group"
      aria-label={t('quick.count')}
      title={t('quick.count')}
    >
      <button
        type="button"
        className="flex h-full w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label={t('quick.less')}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-7 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {value}×
      </span>
      <button
        type="button"
        className="flex h-full w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={() => onChange(Math.min(MAX_COPIES, value + 1))}
        disabled={value >= MAX_COPIES}
        aria-label={t('quick.more')}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
