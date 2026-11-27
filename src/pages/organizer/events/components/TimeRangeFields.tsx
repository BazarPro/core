import { useEffect, useState, type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Input } from '../../../../components/ui/input';
import { TimeInput } from '../../../../components/ui/time-input';
import { Label } from '../../../../components/ui/label';
import { Switch } from '../../../../components/ui/switch';
import { InfoTip } from '../../../../components/ui/info-tip';
import { joinLocal, splitLocal } from '../../../../lib/eventDates';

interface RangeDraft {
  day: string;
  from: string;
  to: string;
  /** Only when the window ends on another day than it starts */
  toDay: string;
}

function fromValues(start: string, end: string): RangeDraft {
  const from = splitLocal(start);
  const to = splitLocal(end);
  return {
    day: from.date || to.date,
    from: from.time,
    to: to.time,
    toDay: to.date && to.date !== (from.date || to.date) ? to.date : '',
  };
}

function toValues(draft: RangeDraft) {
  return {
    start: joinLocal(draft.day, draft.from),
    end: joinLocal(draft.toDay || draft.day, draft.to),
  };
}

/**
 * A time window such as the drop-off: one day, from and until. The form keeps two
 * datetime-local values; a time typed before the day takes `defaultDay` (the event's).
 */
export function TimeRangeFields({
  id,
  label,
  icon,
  info,
  startName,
  endName,
  offName,
  defaultDay,
}: {
  id: string;
  label: string;
  icon?: ReactNode;
  info?: ReactNode;
  startName: string;
  endName: string;
  /** A form field that switches the window off; without it there is no switch */
  offName?: string;
  defaultDay?: string;
}) {
  const { t } = useTranslation('organizer');
  const { watch, setValue } = useFormContext();
  const start = (watch(startName) as string | undefined) ?? '';
  const end = (watch(endName) as string | undefined) ?? '';
  const [draft, setDraft] = useState(() => fromValues(start, end));

  // Values from outside (the event's date moved, a draft) win over what waits here
  useEffect(() => {
    setDraft((current) => {
      const composed = toValues(current);
      if (composed.start === start && composed.end === end) return current;
      const next = fromValues(start, end);
      // Half-filled rows stay as they are while the form has nothing yet
      if (!start && !end) return { ...next, day: current.day, from: current.from, to: current.to };
      return next;
    });
  }, [start, end]);

  const commit = (next: RangeDraft) => {
    const withDay =
      !next.day && (next.from || next.to) && defaultDay ? { ...next, day: defaultDay } : next;
    setDraft(withDay);
    const values = toValues(withDay);
    if (values.start !== start) setValue(startName, values.start, { shouldDirty: true });
    if (values.end !== end) setValue(endName, values.end, { shouldDirty: true });
  };
  // Switched off, the window keeps its times in the form (they still follow the event's
  // date) but they are not saved; switched on again, they are back
  const enabled = !(offName && watch(offName));
  const toggle = (on: boolean) => setValue(offName!, !on, { shouldDirty: true });

  return (
    <fieldset className="space-y-2">
      <legend className="flex w-full items-center gap-1.5 text-sm font-medium">
        {icon}
        {label}
        {info && <InfoTip>{info}</InfoTip>}
        {offName && (
          <Switch
            className="ml-auto"
            checked={enabled}
            onCheckedChange={toggle}
            aria-label={t('logistics.enable', { label })}
          />
        )}
      </legend>
      {enabled ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="col-span-2 space-y-2 sm:col-span-1">
            <Label htmlFor={`${id}Day`}>{t('logistics.day')}</Label>
            <Input
              id={`${id}Day`}
              type="date"
              value={draft.day}
              onChange={(e) => commit({ ...draft, day: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}From`}>{t('logistics.from')}</Label>
            <TimeInput
              id={`${id}From`}
              value={draft.from}
              onChange={(v) => commit({ ...draft, from: v })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}To`}>{t('logistics.until')}</Label>
            <TimeInput
              id={`${id}To`}
              value={draft.to}
              onChange={(v) => commit({ ...draft, to: v })}
            />
          </div>
          {draft.toDay && (
            <div className="col-span-2 space-y-2 sm:col-span-1">
              <Label htmlFor={`${id}ToDay`}>{t('logistics.untilDay')}</Label>
              <Input
                id={`${id}ToDay`}
                type="date"
                value={draft.toDay}
                onChange={(e) => commit({ ...draft, toDay: e.target.value })}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('logistics.off')}</p>
      )}
    </fieldset>
  );
}
