import { useFormContext } from 'react-hook-form';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/text-area';
import { dayBeforeInfo } from '../../../../../convex/reminderContent';
import { logisticsFromForm, type LogisticsForm } from '../../../../lib/sellerLogistics';

const TIME_FIELDS = [
  ['dropoffStart', 'Abgabe ab'],
  ['dropoffEnd', 'Abgabe bis'],
  ['pickupStart', 'Abholung ab'],
  ['pickupEnd', 'Abholung bis'],
] as const;

/**
 * Hand-in and pickup times and a note for sellers. They go into the mail on the
 * evening before the bazaar and the pickup reminder; the organizer sees a preview.
 */
export function EditEventSellerInfo() {
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
  const preview =
    Number.isFinite(start) && Number.isFinite(end)
      ? dayBeforeInfo(
          {
            _id: 'preview',
            title: title || 'Dein Basar',
            location: location || '–',
            startDate: start,
            endDate: end,
            contactInfo: contactInfo ?? '',
            sellerLogistics: logisticsFromForm(logistics),
          },
          { itemCount: 12, sellerNumber: 17 }
        )
      : null;

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div>
        <h2 className="text-2xl">Abgabe & Abholung</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Verkäufer mit angemeldeten Artikeln bekommen am Vorabend um 18 Uhr eine Mail mit allen
          Infos. Nach dem Basar erinnert BazarPro alle, die noch nicht abgerechnet sind, an die
          Abholung.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {TIME_FIELDS.map(([field, label]) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={field}>{label} (optional)</Label>
            <Input id={field} type="datetime-local" {...register(`sellerLogistics.${field}`)} />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="sellerNote">Hinweis für Verkäufer (optional)</Label>
        <Textarea
          id="sellerNote"
          rows={3}
          maxLength={2000}
          placeholder="z. B. Bitte Räder mit Schloss abgeben, Eingang über den Hof"
          {...register('sellerLogistics.note')}
        />
      </div>
      {preview && (
        <details className="rounded-md border bg-muted/30 p-4 text-sm">
          <summary className="cursor-pointer font-medium">Vorschau der Mail am Vorabend</summary>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">Betreff: {preview.subject}</p>
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
            <p className="text-xs text-muted-foreground">
              Beispiel mit Verkäufernummer 17 und 12 Artikeln.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
