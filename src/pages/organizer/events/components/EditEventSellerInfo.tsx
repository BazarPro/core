import { useFormContext } from 'react-hook-form';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/text-area';
import { dayBeforeInfo } from '../../../../shared/reminderContent';
import { mailT } from '../../../../shared/i18n';
import { currentLocale } from '../../../../i18n';
import { logisticsFromForm, type LogisticsForm } from '../../../../lib/sellerLogistics';
import { useTranslation } from 'react-i18next';

const TIME_FIELDS = ['dropoffStart', 'dropoffEnd', 'pickupStart', 'pickupEnd'] as const;

/**
 * Hand-in and pickup times and a note for sellers. They go into the mail on the
 * evening before the bazaar and the pickup reminder; the organizer sees a preview.
 */
export function EditEventSellerInfo() {
  const { t } = useTranslation('organizer');
  const { register, watch } = useFormContext();
  const logistics = watch('sellerLogistics') as LogisticsForm;
  const [title, location, startDate, endDate, contactInfo] = watch([
    'title',
    'location',
    'startDate',
    'endDate',
    'contactInfo',
  ]) as string[];

  const start = startDate ? new Date(startDate).getTime() : NaN;
  const end = endDate ? new Date(endDate).getTime() : NaN;
  // The organizer previews the mail in the language of the app
  const mail = mailT(currentLocale());
  const preview =
    Number.isFinite(start) && Number.isFinite(end)
      ? dayBeforeInfo(
          {
            _id: 'preview',
            title: title || mail('reminder.previewTitle'),
            location: location || '–',
            startDate: start,
            endDate: end,
            contactInfo: contactInfo ?? '',
            sellerLogistics: logisticsFromForm(logistics),
          },
          { itemCount: 12, sellerNumber: 17 },
          mail
        )
      : null;

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div>
        <h2 className="text-2xl">{t('logistics.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('logistics.intro')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {TIME_FIELDS.map((field) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={field}>{t(`logistics.${field}`)}</Label>
            <Input id={field} type="datetime-local" {...register(`sellerLogistics.${field}`)} />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="sellerNote">{t('logistics.note')}</Label>
        <Textarea
          id="sellerNote"
          rows={3}
          maxLength={2000}
          placeholder={t('logistics.notePlaceholder')}
          {...register('sellerLogistics.note')}
        />
      </div>
      {preview && (
        <details className="rounded-md border bg-muted/30 p-4 text-sm">
          <summary className="cursor-pointer font-medium">{t('logistics.preview')}</summary>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('logistics.subject', { subject: preview.subject })}
            </p>
            <p className="font-semibold">{preview.heading}</p>
            {preview.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {preview.details?.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">{t('logistics.example')}</p>
          </div>
        </details>
      )}
    </div>
  );
}
