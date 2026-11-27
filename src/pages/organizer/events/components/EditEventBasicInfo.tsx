import { FormSection } from '../../../../components/ui/form-section';
import { FieldError } from '../../../../components/ui/field-error';
import { useEffect, useState, type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  Bold,
  CalendarDays,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  MapPin,
  Pilcrow,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '../../../../components/ui/input';
import { TimeInput } from '../../../../components/ui/time-input';
import { Label } from '../../../../components/ui/label';
import { LockedChip } from '../../../../components/ui/locked-chip';
import { Textarea } from '../../../../components/ui/text-area';
import { Button } from '../../../../components/ui/button';
import { ImageUpload } from '../../../../components/ui/ImageUpload';
import { SafeMarkdown } from '../../../../components/markdown/SafeMarkdown';
import { IMAGE_UPLOAD_MAX_HEIGHT, IMAGE_UPLOAD_MAX_WIDTH } from '../../../../lib/imageProcessing';
import { Trans, useTranslation } from 'react-i18next';
import { CountrySelect } from '../../../../components/ui/country-select';
import { Checkbox } from '../../../../components/ui/checkbox';
import { InfoTip, LabelWithInfo } from '../../../../components/ui/info-tip';
import { cn } from '../../../../lib/utils';
import {
  addToTime,
  DEFAULT_DURATION_MINUTES,
  DEFAULT_START_TIME,
  joinLocal,
  splitLocal,
} from '../../../../lib/eventDates';

interface EditEventBasicInfoProps {
  initialCoverImageUrl?: string | null;
  /** Running events keep their dates (read-only, still submitted). */
  lockDates?: boolean;
  /** The wizard asks for the pictures in its last step */
  allowCoverImage?: boolean;
  /** Settings that need the dates, e.g. the discount start in the wizard */
  afterDates?: ReactNode;
  /** The wizard asks for date and place first, for the description later */
  parts?: BasicInfoPart[];
  /** More fields at the end of the card, e.g. the contact on the edit page */
  children?: ReactNode;
}

export type BasicInfoPart = 'when' | 'description';

export function EditEventBasicInfo({
  initialCoverImageUrl,
  lockDates = false,
  allowCoverImage = true,
  afterDates,
  parts = ['when', 'description'],
  children,
}: EditEventBasicInfoProps) {
  const { t } = useTranslation('organizer');
  const {
    register,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useFormContext();
  const [descriptionMode, setDescriptionMode] = useState<'edit' | 'preview'>('edit');
  const descriptionValue = watch('description') || '';
  const descriptionField = register('description');
  const addressErrors = errors.address as
    | Partial<Record<'street' | 'postalCode' | 'city' | 'country', { message?: string }>>
    | undefined;
  const initialImageUrls = initialCoverImageUrl ? [initialCoverImageUrl] : [];

  const handleFilesChange = (files: File[]) => {
    const nextFile = files[0];
    setValue('coverImageFile', nextFile ?? undefined, { shouldDirty: true });
    if (nextFile) {
      setValue('removeCoverImage', false, { shouldDirty: true });
      return;
    }
    if (initialCoverImageUrl) {
      setValue('removeCoverImage', true, { shouldDirty: true });
    }
  };

  const handleRemoveExistingImage = (index: number) => {
    void index;
    setValue('removeCoverImage', true, { shouldDirty: true });
    setValue('coverImageFile', undefined, { shouldDirty: true });
  };

  const insertMarkdown = (
    type: 'bold' | 'italic' | 'list' | 'link' | 'h2' | 'h3' | 'paragraph'
  ) => {
    const textarea = document.getElementById('description') as HTMLTextAreaElement | null;
    const current = getValues('description') || '';

    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const selected = current.slice(start, end) || 'Text';

    let replacement = selected;
    switch (type) {
      case 'bold':
        replacement = `**${selected}**`;
        break;
      case 'italic':
        replacement = `*${selected}*`;
        break;
      case 'list':
        replacement = `- ${selected}`;
        break;
      case 'link':
        replacement = `[${selected}](https://example.com)`;
        break;
      case 'h2':
        replacement = `## ${selected}`;
        break;
      case 'h3':
        replacement = `### ${selected}`;
        break;
      case 'paragraph':
        replacement = `\n\n${selected}\n\n`;
        break;
    }

    const nextValue = `${current.slice(0, start)}${replacement}${current.slice(end)}`;
    setValue('description', nextValue, { shouldDirty: true, shouldTouch: true });

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + replacement.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleDescriptionTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') {
      return;
    }
    e.preventDefault();

    const textarea = e.currentTarget;
    const current = getValues('description') || '';
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const replacement = '  ';
    const nextValue = `${current.slice(0, start)}${replacement}${current.slice(end)}`;

    setValue('description', nextValue, { shouldDirty: true, shouldTouch: true });
    requestAnimationFrame(() => {
      const cursor = start + replacement.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const toolbar: { type: Parameters<typeof insertMarkdown>[0]; label: string; icon: LucideIcon }[] =
    [
      { type: 'h2', label: 'H2', icon: Heading2 },
      { type: 'h3', label: 'H3', icon: Heading3 },
      { type: 'paragraph', label: t('basic.paragraph'), icon: Pilcrow },
      { type: 'bold', label: t('basic.bold'), icon: Bold },
      { type: 'italic', label: t('basic.italic'), icon: Italic },
      { type: 'list', label: t('basic.list'), icon: List },
      { type: 'link', label: t('basic.link'), icon: Link },
    ];

  const descriptionEditor = (
    <div className="space-y-2">
      <LabelWithInfo
        htmlFor="description"
        info={<Trans i18nKey="basic.markdownHint" ns="organizer" components={{ code: <code /> }} />}
      >
        {t('basic.description')}
      </LabelWithInfo>
      <div className="overflow-hidden rounded-md border border-input bg-input-background shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring">
        <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
          {toolbar.map(({ type, label, icon: Icon }) => (
            <Button
              key={type}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={label}
              title={label}
              disabled={descriptionMode === 'preview'}
              onClick={() => insertMarkdown(type)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
          <div className="ml-auto flex rounded-md bg-muted p-0.5 text-xs">
            {(['edit', 'preview'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={descriptionMode === mode}
                onClick={() => setDescriptionMode(mode)}
                className={cn(
                  'rounded px-2.5 py-1 font-medium transition-colors',
                  descriptionMode === mode
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {mode === 'edit' ? t('basic.edit') : t('basic.preview')}
              </button>
            ))}
          </div>
        </div>
        {descriptionMode === 'edit' ? (
          <Textarea
            id="description"
            {...descriptionField}
            rows={8}
            className="min-h-48 rounded-none border-0 leading-relaxed shadow-none focus-visible:ring-0"
            onKeyDown={handleDescriptionTab}
            onBlur={(e) => {
              const sanitized = e.target.value.replace(/\t/g, '  ');
              if (sanitized !== e.target.value) {
                setValue('description', sanitized, { shouldDirty: true, shouldTouch: true });
              }
              descriptionField.onBlur(e);
            }}
          />
        ) : (
          <div className="min-h-48 p-4">
            {descriptionValue.trim() ? (
              <SafeMarkdown
                content={descriptionValue}
                className="leading-relaxed space-y-3 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('basic.noDescription')}</p>
            )}
          </div>
        )}
      </div>
      {errors.description && <FieldError>{errors.description.message as string}</FieldError>}
    </div>
  );

  if (!parts.includes('when')) return descriptionEditor;

  return (
    <FormSection>
      <div className="space-y-2" data-onboarding-id="event-form-title">
        <Label htmlFor="title">{t('basic.eventTitle')}</Label>
        <Input id="title" {...register('title')} placeholder={t('basic.titlePlaceholder')} />
        {errors.title && <FieldError>{errors.title.message as string}</FieldError>}
      </div>

      {allowCoverImage && (
        <div className="space-y-2">
          <LabelWithInfo
            info={t('basic.imageHint', {
              width: IMAGE_UPLOAD_MAX_WIDTH,
              height: IMAGE_UPLOAD_MAX_HEIGHT,
            })}
          >
            {t('basic.cover')}
          </LabelWithInfo>
          {/* A thumbnail, not the whole width: the form stays in view */}
          <div className="max-w-sm">
            <ImageUpload
              onFilesChange={handleFilesChange}
              initialImageUrls={initialImageUrls}
              onRemoveExistingImage={handleRemoveExistingImage}
              maxFiles={1}
            />
          </div>
        </div>
      )}

      <EventDateFields lockDates={lockDates} />
      {afterDates}

      <fieldset className="space-y-3">
        <legend className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-primary" />
          {t('basic.place')}
          <InfoTip>{t('basic.addressHint')}</InfoTip>
        </legend>
        <div className="space-y-2">
          <Label htmlFor="location">{t('basic.location')}</Label>
          <Input
            id="location"
            {...register('location')}
            placeholder={t('basic.locationPlaceholder')}
          />
          {errors.location && <FieldError>{errors.location.message as string}</FieldError>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="street">{t('basic.street')}</Label>
          <Input id="street" autoComplete="street-address" {...register('address.street')} />
        </div>
        <div className="grid grid-cols-[minmax(0,6rem)_1fr] gap-3 sm:grid-cols-[minmax(0,6rem)_1fr_minmax(0,11rem)]">
          <div className="space-y-2">
            <Label htmlFor="postalCode">{t('basic.postalCode')}</Label>
            <Input
              id="postalCode"
              inputMode="numeric"
              autoComplete="postal-code"
              {...register('address.postalCode')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">{t('basic.city')}</Label>
            <Input id="city" autoComplete="address-level2" {...register('address.city')} />
          </div>
          <div className="col-span-2 space-y-2 sm:col-span-1">
            <Label htmlFor="country">{t('basic.country')}</Label>
            <CountrySelect id="country" {...register('address.country')} />
          </div>
        </div>
        {addressErrors && (
          <FieldError>
            {
              (addressErrors.street?.message ??
                addressErrors.postalCode?.message ??
                addressErrors.city?.message) as string
            }
          </FieldError>
        )}
      </fieldset>

      {parts.includes('description') && descriptionEditor}
      {children}
    </FormSection>
  );
}

/**
 * Day, start and end of the event. Most bazaars last a few hours: one day and two times,
 * the end day only for longer markets. Picking the day fills in usual times, so only the
 * hours are left to adjust. The form keeps both as datetime-local values.
 */
function EventDateFields({ lockDates }: { lockDates: boolean }) {
  const { t } = useTranslation('organizer');
  const {
    watch,
    setValue,
    getFieldState,
    formState: { errors },
  } = useFormContext();
  const startValue = (watch('startDate') as string | undefined) ?? '';
  const endValue = (watch('endDate') as string | undefined) ?? '';

  // Half-filled entries (a day without a time) are no value yet: they wait here
  const [draft, setDraft] = useState(() => fromValues(startValue, endValue));
  const [multiDay, setMultiDay] = useState(
    () => !!draft.endDay && !!draft.day && draft.endDay !== draft.day
  );
  // A value set from outside (draft, template, reset) wins over what waits here
  useEffect(() => {
    setDraft((current) => {
      const composed = toValues(current);
      if (composed.startDate === startValue && composed.endDate === endValue) return current;
      const next = fromValues(startValue, endValue);
      if (!startValue && !endValue && !next.day) return { ...next, day: current.day };
      return next;
    });
  }, [startValue, endValue]);
  useEffect(() => {
    if (draft.endDay && draft.day && draft.endDay !== draft.day) setMultiDay(true);
  }, [draft.day, draft.endDay]);

  const commit = (next: DateDraft) => {
    setDraft(next);
    const values = toValues(next);
    for (const name of ['startDate', 'endDate'] as const) {
      if (values[name] === (name === 'startDate' ? startValue : endValue)) continue;
      setValue(name, values[name], {
        shouldDirty: true,
        // Checked at once once the field was left before, as typed fields are
        shouldValidate: getFieldState(name).isTouched,
      });
    }
  };

  const changeDay = (day: string) => {
    const startTime = draft.startTime || DEFAULT_START_TIME;
    const endTime = draft.endTime || addToTime(startTime, DEFAULT_DURATION_MINUTES);
    const endDay = multiDay && draft.endDay && draft.endDay > day ? draft.endDay : day;
    commit({ day, startTime, endTime, endDay });
  };
  const changeStartTime = (startTime: string) => {
    let endTime = draft.endTime;
    // The end keeps its distance to the start, within the same day
    if (startTime && draft.startTime && draft.endTime) {
      const [h1, m1] = draft.startTime.split(':').map(Number);
      const [h2, m2] = startTime.split(':').map(Number);
      endTime = addToTime(draft.endTime, h2 * 60 + m2 - (h1 * 60 + m1));
    } else if (startTime && !endTime) {
      endTime = addToTime(startTime, DEFAULT_DURATION_MINUTES);
    }
    commit({ ...draft, startTime, endTime });
  };
  const toggleMultiDay = (checked: boolean) => {
    setMultiDay(checked);
    if (!checked) commit({ ...draft, endDay: draft.day });
  };

  const lockProps = {
    readOnly: lockDates,
    'aria-readonly': lockDates,
  };
  const startError = errors.startDate?.message as string | undefined;
  const endError = errors.endDate?.message as string | undefined;

  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <CalendarDays className="h-4 w-4 text-primary" />
        {t('basic.when')}
        <InfoTip>{t('basic.whenHint')}</InfoTip>
        {lockDates && <LockedChip />}
      </legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="col-span-2 space-y-2 sm:col-span-1">
          <Label htmlFor="startDay">{multiDay ? t('basic.firstDay') : t('basic.day')}</Label>
          <Input
            id="startDay"
            type="date"
            value={draft.day}
            onChange={(e) => changeDay(e.target.value)}
            {...lockProps}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="startTime">{t('basic.startTime')}</Label>
          <TimeInput
            id="startTime"
            value={draft.startTime}
            onChange={(v) => changeStartTime(v)}
            {...lockProps}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endTime">{t('basic.endTime')}</Label>
          <TimeInput
            id="endTime"
            value={draft.endTime}
            onChange={(v) => commit({ ...draft, endTime: v })}
            {...lockProps}
          />
        </div>
        {multiDay && (
          <div className="col-span-2 space-y-2 sm:col-span-1">
            <Label htmlFor="endDay">{t('basic.lastDay')}</Label>
            <Input
              id="endDay"
              type="date"
              min={draft.day || undefined}
              value={draft.endDay}
              onChange={(e) => commit({ ...draft, endDay: e.target.value })}
              {...lockProps}
            />
          </div>
        )}
      </div>
      {!lockDates && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="multiDay"
            checked={multiDay}
            onCheckedChange={(checked) => toggleMultiDay(!!checked)}
          />
          <Label htmlFor="multiDay" className="cursor-pointer text-xs font-normal">
            {t('basic.multiDay')}
          </Label>
        </div>
      )}
      {(startError || endError) && <FieldError>{startError ?? endError}</FieldError>}
    </fieldset>
  );
}

interface DateDraft {
  day: string;
  startTime: string;
  endTime: string;
  endDay: string;
}

function fromValues(startDate: string, endDate: string): DateDraft {
  const start = splitLocal(startDate);
  const end = splitLocal(endDate);
  return { day: start.date, startTime: start.time, endTime: end.time, endDay: end.date };
}

function toValues(draft: DateDraft): { startDate: string; endDate: string } {
  return {
    startDate: joinLocal(draft.day, draft.startTime),
    endDate: joinLocal(draft.endDay || draft.day, draft.endTime),
  };
}
