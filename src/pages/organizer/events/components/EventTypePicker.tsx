import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ItemPhoto } from '../../../../components/illustrations/ItemIllustrations';
import { EVENT_TYPES, type EventTypeId } from '../../../../lib/eventTypes';
import { cn } from '../../../../lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';

/**
 * First step of the creation wizard: the kind of bazaar sets suggested settings, or a
 * past event is copied. Cards with the typical item, the most asked for kinds first.
 */
export function EventTypePicker({
  selected,
  onPick,
  pastEvents,
  onCopy,
}: {
  selected?: EventTypeId;
  onPick: (id: EventTypeId) => void;
  pastEvents?: { _id: string; title: string }[];
  onCopy: (eventId: string) => void;
}) {
  const { t } = useTranslation('organizer');

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {EVENT_TYPES.map((type) => {
          const active = selected === type.id;
          const highlights = t(`eventTypes.${type.id}.highlights`, {
            returnObjects: true,
          }) as string[];
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onPick(type.id)}
              aria-pressed={active}
              className={cn(
                'group flex h-full flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all',
                'hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active && 'border-primary ring-2 ring-primary/30'
              )}
            >
              <div className="relative">
                <ItemPhoto
                  kind={type.item}
                  className="aspect-[5/2] transition-transform duration-300 group-hover:scale-[1.03]"
                />
                {active && (
                  <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <span className="text-lg font-semibold">{t(`eventTypes.${type.id}.title`)}</span>
                <span className="text-sm text-muted-foreground">
                  {t(`eventTypes.${type.id}.text`)}
                </span>
                <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {highlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                    >
                      {highlight}
                    </span>
                  ))}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {pastEvents && pastEvents.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium">{t('form.template')}</div>
              <div className="text-xs text-muted-foreground">{t('form.templateHint')}</div>
            </div>
          </div>
          <Select onValueChange={onCopy}>
            <SelectTrigger className="w-full bg-background sm:w-[250px]">
              <SelectValue placeholder={t('form.chooseTemplate')} />
            </SelectTrigger>
            <SelectContent>
              {pastEvents.map((event) => (
                <SelectItem key={event._id} value={event._id}>
                  {event.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
