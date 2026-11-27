import { useState } from 'react';
import { BadgeCheck, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  describeFeeGroups,
  type FeeGroupTerms,
  type SellerConditionsEvent,
} from '../../lib/sellerFees';
import { useMutation, useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

/** The groups with own fees, under the bazaar's fees in the conditions (#302). */
export function FeeGroupList({ groups }: { groups: FeeGroupTerms[] }) {
  const { t } = useTranslation('events');
  if (groups.length === 0) return null;
  return (
    <div className="mt-3 space-y-2" data-testid="fee-groups">
      <p className="text-sm font-medium">{t('conditions.groupsTitle')}</p>
      <ul className="space-y-2">
        {groups.map(({ group, fees, how }) => (
          <li key={group.id} className="flex list-none gap-2 text-sm">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium">{group.label}:</span> {fees}
              <span className="block text-xs text-muted-foreground">{how}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The groups a seller may say they belong to; `null`: none, the bazaar's fees. */
export function FeeGroupChoice({
  event,
  value,
  onChange,
  disabled,
}: {
  event: SellerConditionsEvent;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('events');
  const choosable = describeFeeGroups(event).filter(
    ({ group }) => group.assignment === 'selfDeclared'
  );
  if (choosable.length === 0) return null;
  const options = [
    { id: 'none', label: t('conditions.choiceNone'), detail: undefined },
    ...choosable.map(({ group, fees, how }) => ({
      id: group.id,
      label: group.label,
      detail: `${fees} · ${how}`,
    })),
  ];
  return (
    <fieldset className="space-y-3 rounded-lg border p-4" data-testid="fee-group-choice">
      <legend className="px-1 text-sm font-medium">{t('conditions.choiceTitle')}</legend>
      <RadioGroup
        value={value ?? 'none'}
        onValueChange={(next) => onChange(next === 'none' ? null : next)}
        disabled={disabled}
        className="gap-2"
      >
        {options.map((option) => (
          <Label
            key={option.id}
            htmlFor={`fee-group-${option.id}`}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal transition-colors hover:bg-muted/50',
              (value ?? 'none') === option.id && 'border-primary bg-primary/5'
            )}
          >
            <RadioGroupItem id={`fee-group-${option.id}`} value={option.id} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block font-medium">{option.label}</span>
              {option.detail && (
                <span className="block text-xs text-muted-foreground">{option.detail}</span>
              )}
            </span>
          </Label>
        ))}
      </RadioGroup>
      <p className="text-xs text-muted-foreground">{t('conditions.choiceHint')}</p>
    </fieldset>
  );
}

/**
 * A registered seller's own group in the conditions: which applies, whether the team
 * still checks it, and changing it until the first item is accepted.
 */
export function MyFeeGroup({
  eventId,
  event,
}: {
  eventId: Id<'events'>;
  event: SellerConditionsEvent;
}) {
  const { t } = useTranslation('events');
  const groups = event.features?.feeGroups ?? [];
  const mine = useQuery(api.feeGroups.getMyFeeGroup, groups.length > 0 ? { eventId } : 'skip');
  const choose = useMutation(api.feeGroups.chooseFeeGroup);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!mine) return null;
  const applied = groups.find((group) => group.id === mine.applied);
  const selfDeclared = groups.some((group) => group.assignment === 'selfDeclared');
  const Icon = mine.pending ? Clock : applied ? BadgeCheck : Users;

  const save = async () => {
    setSaving(true);
    try {
      await choose({ eventId, groupId: choice });
      toast.success(t('conditions.myGroupSaved'));
      setOpen(false);
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="mb-3 flex items-start gap-2 rounded-md border bg-background p-3 text-sm"
      data-testid="my-fee-group"
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          mine.pending
            ? 'text-warning-soft-foreground'
            : applied
              ? 'text-success-soft-foreground'
              : 'text-muted-foreground'
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {applied
            ? t('conditions.myGroup', { group: applied.label })
            : t('conditions.myGroupNone')}
        </p>
        {applied && (
          <p className="text-xs text-muted-foreground">
            {mine.pending ? t('conditions.myGroupPending') : t('conditions.myGroupConfirmed')}
          </p>
        )}
        {mine.locked && selfDeclared && (
          <p className="text-xs text-muted-foreground">{t('conditions.myGroupLocked')}</p>
        )}
      </div>
      {!mine.locked && selfDeclared && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => {
            setChoice(mine.chosen ?? null);
            setOpen(true);
          }}
        >
          {mine.chosen ? t('conditions.myGroupChange') : t('conditions.myGroupChoose')}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('conditions.choiceDialogTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('conditions.choiceTitle')}</DialogDescription>
          </DialogHeader>
          <FeeGroupChoice event={event} value={choice} onChange={setChoice} disabled={saving} />
          <div className="flex gap-2">
            <Button className="flex-1" loading={saving} onClick={() => void save()}>
              {t('conditions.choiceSave')}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              {t('actions.cancel', { ns: 'common' })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
