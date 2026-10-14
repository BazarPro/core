import type { ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import type { Doc } from '../../../../../../convex/_generated/dataModel';
import { resolveEventFeatures } from '../../../../../../convex/eventFeatures';
import { VISIBILITY_OPTIONS } from '../../../../../constants/records';
import { formatDateRangeDE } from '../../../../../lib/utils';
import { Badge } from '../../../../../components/ui/badge';

type EventWithLabels = Doc<'events'> & { categoryLabels: string[] };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1 sm:gap-4 py-2 border-b last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Feature({ on, title, detail }: { on: boolean; title: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2">
      {on ? (
        <Check className="h-4 w-4 mt-0.5 text-green-600 shrink-0" aria-label="aktiv" />
      ) : (
        <Minus className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" aria-label="aus" />
      )}
      <span className={on ? '' : 'text-muted-foreground'}>
        {title}
        {on && detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
      </span>
    </li>
  );
}

const timeFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Read-only overview of the current event settings. */
export function EventSettingsSummary({ event }: { event: EventWithLabels }) {
  const features = resolveEventFeatures(event);
  const discountDetail = [
    features.discountStartsAt
      ? `ab ${timeFormat.format(features.discountStartsAt)} Uhr`
      : 'ab Beginn der Veranstaltung',
    `höchstens ${features.maxDiscountPercent} %`,
  ].join(', ');

  return (
    <dl data-testid="event-settings-summary">
      <Row label="Termin">{formatDateRangeDE(event.startDate, event.endDate)}</Row>
      <Row label="Ort">{event.location}</Row>
      <Row label="Provision">{event.commission} %</Row>
      <Row label="Sichtbarkeit">{VISIBILITY_OPTIONS[event.visibility].title}</Row>
      <Row label="Zugangscode">{event.accessCode || 'Kein Code'}</Row>
      <Row label="Teilnehmerlimit">
        {event.vendorLimit ? `${event.vendorLimit} Verkäufer` : 'Unbegrenzt'}
      </Row>
      <Row label="Kategorien">
        <div className="flex flex-wrap gap-1">
          {event.categoryLabels.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      </Row>
      <Row label="Services">{event.services.length > 0 ? event.services.join(', ') : 'Keine'}</Row>
      <Row label="Funktionen">
        <ul className="space-y-1.5">
          <Feature on={features.discounts} title="Artikel rabattieren" detail={discountDetail} />
          <Feature on={features.priceOffers} title="Preisvorschläge online" />
          <Feature on={features.minimumPrice} title="Verhandeln vor Ort (Mindestpreis / VB)" />
          <Feature on={features.questions} title="Fragen an den Verkäufer" />
          <Feature on={features.photosOptional} title="Artikel ohne Foto" />
          {features.maxItemsPerSeller !== undefined && (
            <Feature
              on={true}
              title={`Höchstens ${features.maxItemsPerSeller} Artikel pro Verkäufer`}
            />
          )}
          <Feature
            on={true}
            title={
              features.labelFormat === 'small'
                ? 'Kleine Etiketten (40 pro Seite)'
                : 'Große Etiketten (12 pro Seite)'
            }
          />
          <Feature
            on={features.priceOnLabel && !features.discounts}
            title="Preis auf dem Etikett"
          />
        </ul>
      </Row>
    </dl>
  );
}
