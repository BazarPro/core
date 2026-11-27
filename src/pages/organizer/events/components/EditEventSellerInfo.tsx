import { FormSection } from '../../../../components/ui/form-section';
import { useFormContext } from 'react-hook-form';
import { Textarea } from '../../../../components/ui/text-area';
import { dayBeforeInfo } from '../../../../shared/reminderContent';
import { mailT } from '../../../../shared/i18n';
import { currentLocale } from '../../../../i18n';
import { logisticsFromForm, type LogisticsForm } from '../../../../lib/sellerLogistics';
import { useTranslation } from 'react-i18next';
import { Mail, Package, Truck } from 'lucide-react';
import { InfoTip, LabelWithInfo } from '../../../../components/ui/info-tip';
import { splitLocal } from '../../../../lib/eventDates';
import { TimeRangeFields } from './TimeRangeFields';

/**
 * Hand-in and pickup times and a note for sellers. They go into the mail on the
 * evening before the bazaar and the pickup reminder; the organizer sees a preview.
 */
export function EditEventSellerInfo() {
  const { t } = useTranslation('organizer');
  const { register, watch } = useFormContext();
  const logistics = watch('sellerLogistics') as LogisticsForm;
  // Sellers stand at their items: the same times are setup and teardown (#299)
  const directSale = !!watch('features.directSale');
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
            directSale,
            sellerLogistics: logisticsFromForm(logistics),
          },
          { itemCount: 12, sellerNumber: 17 },
          mail
        )
      : null;

  return (
    <FormSection>
      <TimeRangeFields
        id="dropoff"
        label={t(directSale ? 'logistics.setup' : 'logistics.dropoff')}
        icon={<Truck className="h-4 w-4 text-primary" />}
        startName="sellerLogistics.dropoffStart"
        endName="sellerLogistics.dropoffEnd"
        offName="sellerLogistics.dropoffOff"
        defaultDay={splitLocal(startDate).date}
      />
      <TimeRangeFields
        id="pickup"
        label={t(directSale ? 'logistics.teardown' : 'logistics.pickup')}
        icon={<Package className="h-4 w-4 text-primary" />}
        startName="sellerLogistics.pickupStart"
        endName="sellerLogistics.pickupEnd"
        offName="sellerLogistics.pickupOff"
        defaultDay={splitLocal(endDate).date}
      />
      <div className="space-y-2">
        <LabelWithInfo htmlFor="sellerNote" info={t('logistics.noteHint')}>
          {t('logistics.note')}
        </LabelWithInfo>
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
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <Mail className="h-4 w-4 text-primary" />
            {t('logistics.preview')}
            <InfoTip>{t(directSale ? 'logistics.introDirect' : 'logistics.intro')}</InfoTip>
          </summary>
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
    </FormSection>
  );
}
