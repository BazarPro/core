import { FormSection } from '../../../../components/ui/form-section';
import { useFormContext, useWatch, Controller } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { RadioGroup, RadioGroupItem } from '../../../../components/ui/radio-group';
import { InfoTip, LabelWithInfo } from '../../../../components/ui/info-tip';
import { VISIBILITY_OPTIONS } from '../../../../constants/records';
import { EVENT_VISIBILITY, type EventVisibility } from '../../../../shared/constants';
import { cn } from '../../../../lib/utils';
import { LockedChip } from '../../../../components/ui/locked-chip';
import { Globe, Link2, LogIn, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const VISIBILITY_ICONS: Record<EventVisibility, LucideIcon> = {
  public: Globe,
  'logged-in': LogIn,
  approved: Link2,
};

export function EditEventAccess({ lockVisibility = false }: { lockVisibility?: boolean }) {
  const { t } = useTranslation('organizer');
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext();
  const visibility = useWatch({ control, name: 'visibility' }) as EventVisibility | undefined;
  const linkOnly = visibility === 'approved';
  const codeError = errors.accessCode?.message;

  return (
    <FormSection>
      <div className="space-y-3">
        <div className="flex items-center gap-1">
          <Label>{t('access.visibility')}</Label>
          <InfoTip>{t('access.visibilityHint')}</InfoTip>
          {lockVisibility && <LockedChip />}
        </div>
        <Controller
          name="visibility"
          control={control}
          render={({ field }) => (
            <RadioGroup
              onValueChange={field.onChange}
              value={field.value}
              disabled={lockVisibility}
              className="grid-cols-1 sm:grid-cols-3"
            >
              {EVENT_VISIBILITY.map((v) => {
                const Icon = VISIBILITY_ICONS[v];
                const active = field.value === v;
                return (
                  <Label
                    key={v}
                    htmlFor={v}
                    className={cn(
                      'relative flex cursor-pointer flex-col items-start gap-2 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/50',
                      active && 'border-primary bg-primary/5 ring-1 ring-primary/40'
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      <Icon
                        className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')}
                      />
                      <span className="flex-1 font-medium">{VISIBILITY_OPTIONS[v].title}</span>
                      <RadioGroupItem value={v} id={v} />
                    </span>
                    <span className="text-xs leading-snug text-muted-foreground">
                      {VISIBILITY_OPTIONS[v].description}
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>
          )}
        />
        {linkOnly && (
          <div
            className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            data-testid="link-only-help"
          >
            <span className="inline-flex items-center gap-1">
              {t('access.linkOnlyTitle')}
              <InfoTip>
                <ul className="list-disc space-y-1 pl-4">
                  <li>{t('access.linkOnlyHidden')}</li>
                  <li>{t('access.linkOnlyLink')}</li>
                  <li>{t('access.linkOnlyJoin')}</li>
                  <li>{t('access.linkOnlyItems')}</li>
                </ul>
              </InfoTip>
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <LabelWithInfo htmlFor="accessCode" info={t('access.codeHint')}>
            {t(linkOnly ? 'access.codeRequired' : 'access.code')}
          </LabelWithInfo>
          <Input
            id="accessCode"
            {...register('accessCode')}
            placeholder={t('access.codePlaceholder')}
          />
          {typeof codeError === 'string' && <p className="text-sm text-destructive">{codeError}</p>}
        </div>

        <div className="space-y-2">
          <LabelWithInfo htmlFor="vendorLimit" info={t('access.limitHint')}>
            {t('access.limit')}
          </LabelWithInfo>
          <Input
            id="vendorLimit"
            type="number"
            {...register('vendorLimit', { valueAsNumber: true })}
            placeholder={t('access.limitPlaceholder')}
          />
        </div>
      </div>
    </FormSection>
  );
}
