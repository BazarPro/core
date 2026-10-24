import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { FunctionReturnType, Id } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { formatDateDEShort } from '../../lib/utils';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type PastEvent = FunctionReturnType<
  typeof api.users.getAccountDeletionInfo
>['pastOrganizedEvents'][number];

/**
 * Past bazaars of an account about to be deleted: hand each over to a helper, or confirm
 * that the settlements were exported (#168).
 */
export function PastEventsHandover({
  events,
  exported,
  onExportedChange,
}: {
  events: PastEvent[];
  exported: boolean;
  onExportedChange: (exported: boolean) => void;
}) {
  const { t } = useTranslation('account');
  if (events.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-foreground dark:border-amber-500/30 dark:bg-amber-950/30">
      <p className="font-medium">{t('danger.pastEventsTitle')}</p>
      <p className="text-muted-foreground">{t('danger.pastEventsText')}</p>
      <ul className="space-y-2">
        {events.map((event) => (
          <HandoverRow key={event._id} event={event} />
        ))}
      </ul>
      <div className="flex items-start gap-2">
        <Checkbox
          id="settlement-exported"
          checked={exported}
          onCheckedChange={(checked) => onExportedChange(!!checked)}
        />
        <label htmlFor="settlement-exported" className="leading-snug">
          {t('danger.settlementExported')}
        </label>
      </div>
    </div>
  );
}

function HandoverRow({ event }: { event: PastEvent }) {
  const { t } = useTranslation('account');
  const transfer = useMutation(api.eventRoles.transferOrganizer);
  const [helper, setHelper] = useState<Id<'users'> | ''>('');
  const [busy, setBusy] = useState(false);

  const handOver = async () => {
    const chosen = event.coOrganizers.find((c) => c._id === helper);
    if (!chosen) return;
    setBusy(true);
    try {
      await transfer({ eventId: event._id, userId: chosen._id });
      toast.success(t('danger.transferred', { title: event.title, name: chosen.name ?? '' }));
    } catch (error) {
      toast.error(t('danger.transferFailed'), { description: getUserFacingErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0">
        <span className="font-medium">{event.title}</span>{' '}
        <span className="text-muted-foreground">{formatDateDEShort(event.endDate)}</span>
      </span>
      {event.coOrganizers.length === 0 ? (
        <span className="text-muted-foreground">{t('danger.noHelpers')}</span>
      ) : (
        <span className="flex gap-2">
          <Select value={helper} onValueChange={(value) => setHelper(value as Id<'users'>)}>
            <SelectTrigger className="w-40" aria-label={t('danger.transferTo')}>
              <SelectValue placeholder={t('danger.chooseHelper')} />
            </SelectTrigger>
            <SelectContent>
              {event.coOrganizers.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name ?? c._id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!helper || busy}
            onClick={handOver}
          >
            {t('danger.transfer')}
          </Button>
        </span>
      )}
    </li>
  );
}
