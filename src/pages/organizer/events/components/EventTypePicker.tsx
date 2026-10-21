import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
 * past event is copied.
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
      <div className="grid gap-3 sm:grid-cols-2">
        {EVENT_TYPES.map((type) => {
          const Icon = type.icon;
          const active = selected === type.id;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onPick(type.id)}
              aria-pressed={active}
              className={cn(
                'flex h-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary/60',
                active && 'border-primary bg-primary/5'
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Icon className="h-5 w-5 text-primary" />
                {t(`eventTypes.${type.id}.title`)}
                {active && <Check className="ml-auto h-4 w-4 text-primary" />}
              </span>
              <span className="text-sm text-muted-foreground">
                {t(`eventTypes.${type.id}.text`)}
              </span>
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
