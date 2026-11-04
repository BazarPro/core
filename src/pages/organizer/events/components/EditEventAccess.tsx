import { useFormContext, useWatch, Controller } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { RadioGroup, RadioGroupItem } from '../../../../components/ui/radio-group';
import { VISIBILITY_OPTIONS } from '../../../../constants/records';
import { EVENT_VISIBILITY } from '../../../../shared/constants';
import { useTranslation } from 'react-i18next';

export function EditEventAccess({ lockVisibility = false }: { lockVisibility?: boolean }) {
  const { t } = useTranslation('organizer');
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext();
  const linkOnly = useWatch({ control, name: 'visibility' }) === 'approved';
  const codeError = errors.accessCode?.message;

  return (
    <div className="bg-card rounded-xl border p-6 space-y-6">
      <h2 className="text-2xl">{t('access.title')}</h2>

      <div className="space-y-3">
        <Label>{t('access.visibility')}</Label>
        <Controller
          name="visibility"
          control={control}
          render={({ field }) => (
            <RadioGroup
              onValueChange={field.onChange}
              value={field.value}
              disabled={lockVisibility}
            >
              {EVENT_VISIBILITY.map((v) => (
                <div
                  key={v}
                  className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted/50"
                >
                  <RadioGroupItem value={v} id={v} />
                  <Label htmlFor={v} className="cursor-pointer flex-1">
                    {VISIBILITY_OPTIONS[v].title} - {VISIBILITY_OPTIONS[v].description}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
        />
        {linkOnly && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm" data-testid="link-only-help">
            <p className="font-medium">{t('access.linkOnlyTitle')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>{t('access.linkOnlyHidden')}</li>
              <li>{t('access.linkOnlyLink')}</li>
              <li>{t('access.linkOnlyJoin')}</li>
              <li>{t('access.linkOnlyItems')}</li>
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="accessCode">{t(linkOnly ? 'access.codeRequired' : 'access.code')}</Label>
        <Input
          id="accessCode"
          {...register('accessCode')}
          placeholder={t('access.codePlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('access.codeHint')}</p>
        {typeof codeError === 'string' && <p className="text-sm text-destructive">{codeError}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="vendorLimit">{t('access.limit')}</Label>
        <Input
          id="vendorLimit"
          type="number"
          {...register('vendorLimit', { valueAsNumber: true })}
          placeholder={t('access.limitPlaceholder')}
        />
      </div>
    </div>
  );
}
