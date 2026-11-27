import { useState, type ReactNode } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { NativeSelect } from '../../../../components/ui/native-select';
import { FieldError } from '../../../../components/ui/field-error';
import { InfoTip, LabelWithInfo } from '../../../../components/ui/info-tip';
import { cn, formatPrice } from '../../../../lib/utils';
import { feeGroupAdvantages, type FeeLock } from '../../../../lib/sellerFees';
import {
  MAX_FEE_GROUPS,
  newFeeGroupId,
  type FeeGroupAssignment,
} from '../../../../shared/feeGroups';

/** A fee group as the form holds it: empty numbers are NaN, the hint a string. */
export interface FeeGroupForm {
  id: string;
  label: string;
  commission: number;
  intakeFee?: number;
  maxFeesPerSeller?: number;
  maxItemsPerSeller?: number;
  assignment: FeeGroupAssignment;
  proofHint: string;
}

const given = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A number field with its unit inside, like the bazaar's own fees. */
function UnitInput({
  id,
  unit,
  readOnly,
  ...props
}: React.ComponentProps<typeof Input> & { unit?: string }) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        min={0}
        readOnly={readOnly}
        aria-readonly={readOnly}
        className={cn(unit && 'pr-8')}
        {...props}
      />
      {unit && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
}

function Field({
  htmlFor,
  label,
  info,
  error,
  children,
}: {
  htmlFor: string;
  label: string;
  info?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <LabelWithInfo htmlFor={htmlFor} info={info}>
        {label}
      </LabelWithInfo>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

type GroupErrors = Partial<Record<keyof FeeGroupForm, { message?: string }>>;

/**
 * Fee groups of the bazaar (#302): own fees for club members, helpers and others. Each
 * group is a row with its fees in short; one opens to change it. Once sellers registered,
 * a group that existed then cannot be removed and its fees only go down.
 */
export function EditEventFeeGroups({
  feeLock,
  registeredIds = [],
}: {
  feeLock: FeeLock;
  /** Groups sellers registered with: they stay */
  registeredIds?: string[];
}) {
  const { t } = useTranslation('organizer');
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: 'features.feeGroups' });
  const groups = (useWatch({ control, name: 'features.feeGroups' }) ?? []) as FeeGroupForm[];
  const commission = useWatch({ control, name: 'commission' }) as number;
  const eventCap = useWatch({ control, name: 'features.maxFeesPerSeller' }) as number | undefined;
  const eventItems = useWatch({ control, name: 'features.maxItemsPerSeller' }) as
    | number
    | undefined;
  const eventIntakeFee = useWatch({ control, name: 'features.intakeFee' }) as number | undefined;
  const [open, setOpen] = useState<string | null>(null);
  const running = feeLock === 'running';
  const groupErrors = (
    errors.features as { feeGroups?: GroupErrors[] & { message?: string } } | undefined
  )?.feeGroups;

  const add = () => {
    const id = newFeeGroupId();
    append({
      id,
      label: '',
      commission: given(commission) ? commission : 0,
      intakeFee: NaN,
      maxFeesPerSeller: NaN,
      maxItemsPerSeller: NaN,
      assignment: 'selfDeclared',
      proofHint: '',
    } satisfies FeeGroupForm);
    setOpen(id);
  };

  // Only what the group changes against the bazaar, as sellers will read it
  const bazaar = {
    commission: given(commission) ? commission : 0,
    features: {
      intakeFee: given(eventIntakeFee) ? eventIntakeFee : undefined,
      maxFeesPerSeller: given(eventCap) ? eventCap : undefined,
      maxItemsPerSeller: given(eventItems) ? eventItems : undefined,
    },
  };
  const summary = (group: FeeGroupForm) =>
    [
      ...feeGroupAdvantages(bazaar, {
        id: group.id,
        label: group.label,
        commission: given(group.commission) ? group.commission : 0,
        intakeFee: given(group.intakeFee) ? group.intakeFee : undefined,
        maxFeesPerSeller: given(group.maxFeesPerSeller) ? group.maxFeesPerSeller : undefined,
        maxItemsPerSeller: given(group.maxItemsPerSeller) ? group.maxItemsPerSeller : undefined,
        assignment: group.assignment,
      }),
      t(`feeGroups.assignment.${group.assignment}Short`),
    ].join(' · ');

  return (
    <div className="space-y-3 border-t pt-5 sm:col-span-2">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium">{t('feeGroups.title')}</p>
        <InfoTip>{t('feeGroups.hint')}</InfoTip>
      </div>
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('feeGroups.empty')}</p>
      )}
      {fields.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {fields.map((field, index) => {
            const group = groups[index] ?? (field as unknown as FeeGroupForm);
            const isOpen = open === group.id;
            const error = groupErrors?.[index];
            const hasError = !!error && Object.keys(error).length > 0;
            const fixed = !!feeLock && registeredIds.includes(group.id);
            const prefix = `features.feeGroups.${index}`;
            const domId = `fee-group-${index}`;
            return (
              <li key={field.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={isOpen || hasError}
                  aria-controls={`${domId}-panel`}
                  onClick={() => setOpen(isOpen ? null : group.id)}
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <Users className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm font-medium',
                        !group.label.trim() && 'text-muted-foreground italic'
                      )}
                    >
                      {group.label.trim() || t('feeGroups.unnamed')}
                    </span>
                    <span className="block text-xs text-muted-foreground sm:truncate">
                      {summary(group)}
                    </span>
                  </span>
                  {hasError && !isOpen && (
                    <span className="text-xs text-destructive">{t('feeGroups.hasError')}</span>
                  )}
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      (isOpen || hasError) && 'rotate-180'
                    )}
                  />
                </button>
                {(isOpen || hasError) && (
                  <div
                    id={`${domId}-panel`}
                    className="space-y-4 border-t bg-muted/20 px-3 py-4 animate-in fade-in slide-in-from-top-1 duration-200"
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field
                        htmlFor={`${domId}-label`}
                        label={t('feeGroups.label')}
                        error={error?.label?.message}
                      >
                        <Input
                          id={`${domId}-label`}
                          placeholder={t('feeGroups.labelPlaceholder')}
                          maxLength={60}
                          {...register(`${prefix}.label`)}
                        />
                      </Field>
                      <Field
                        htmlFor={`${domId}-assignment`}
                        label={t('feeGroups.assignmentLabel')}
                        info={t(`feeGroups.assignment.${group.assignment}Hint`)}
                        error={error?.assignment?.message}
                      >
                        <NativeSelect
                          id={`${domId}-assignment`}
                          disabled={fixed || running}
                          {...register(`${prefix}.assignment`)}
                        >
                          <option value="selfDeclared">
                            {t('feeGroups.assignment.selfDeclared')}
                          </option>
                          {/* Helpers are in their group by role: one such group per bazaar */}
                          <option
                            value="helpers"
                            disabled={groups.some(
                              (other, i) => i !== index && other.assignment === 'helpers'
                            )}
                          >
                            {t('feeGroups.assignment.helpers')}
                          </option>
                          <option value="manual">{t('feeGroups.assignment.manual')}</option>
                        </NativeSelect>
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-4 lg:grid-cols-4">
                      <Field
                        htmlFor={`${domId}-commission`}
                        label={t('feeGroups.commission')}
                        error={error?.commission?.message}
                      >
                        <UnitInput
                          id={`${domId}-commission`}
                          unit="%"
                          step={0.5}
                          max={100}
                          readOnly={running}
                          {...register(`${prefix}.commission`, { valueAsNumber: true })}
                        />
                      </Field>
                      <Field
                        htmlFor={`${domId}-intakeFee`}
                        label={t('feeGroups.intakeFee')}
                        error={error?.intakeFee?.message}
                      >
                        <UnitInput
                          id={`${domId}-intakeFee`}
                          unit="€"
                          step={0.5}
                          max={100}
                          placeholder={t('features.none')}
                          readOnly={running}
                          {...register(`${prefix}.intakeFee`, { valueAsNumber: true })}
                        />
                      </Field>
                      <Field
                        htmlFor={`${domId}-cap`}
                        label={t('feeGroups.cap')}
                        info={t('feeGroups.capHint')}
                        error={error?.maxFeesPerSeller?.message}
                      >
                        <UnitInput
                          id={`${domId}-cap`}
                          unit="€"
                          step={0.01}
                          max={10_000}
                          placeholder={
                            given(eventCap)
                              ? t('feeGroups.likeBazaar', { value: `${formatPrice(eventCap)} €` })
                              : t('features.noCap')
                          }
                          readOnly={running}
                          {...register(`${prefix}.maxFeesPerSeller`, { valueAsNumber: true })}
                        />
                      </Field>
                      <Field
                        htmlFor={`${domId}-items`}
                        label={t('feeGroups.items')}
                        info={t('feeGroups.itemsHint')}
                        error={error?.maxItemsPerSeller?.message}
                      >
                        <UnitInput
                          id={`${domId}-items`}
                          min={1}
                          placeholder={
                            given(eventItems)
                              ? t('feeGroups.likeBazaar', { value: eventItems })
                              : t('features.unlimited')
                          }
                          {...register(`${prefix}.maxItemsPerSeller`, { valueAsNumber: true })}
                        />
                      </Field>
                    </div>
                    {group.assignment === 'selfDeclared' && (
                      <Field
                        htmlFor={`${domId}-proof`}
                        label={t('feeGroups.proofHint')}
                        info={t('feeGroups.proofHintInfo')}
                        error={error?.proofHint?.message}
                      >
                        <Input
                          id={`${domId}-proof`}
                          placeholder={t('feeGroups.proofHintPlaceholder')}
                          maxLength={200}
                          {...register(`${prefix}.proofHint`)}
                        />
                      </Field>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {fixed && t('feeGroups.fixed')}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={fixed || running}
                        onClick={() => {
                          remove(index);
                          setOpen(null);
                        }}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" /> {t('feeGroups.remove')}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {groupErrors?.message && <FieldError>{groupErrors.message}</FieldError>}
      {!running && fields.length < MAX_FEE_GROUPS && (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1.5 h-4 w-4" /> {t('feeGroups.add')}
        </Button>
      )}
    </div>
  );
}
