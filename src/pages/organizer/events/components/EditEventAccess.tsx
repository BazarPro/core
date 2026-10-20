import { useFormContext, Controller } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { RadioGroup, RadioGroupItem } from '../../../../components/ui/radio-group';
import { VISIBILITY_OPTIONS } from '../../../../constants/records';
import { EVENT_VISIBILITY } from '../../../../../convex/constants';
import { useTranslation } from 'react-i18next';

export function EditEventAccess({ lockVisibility = false }: { lockVisibility?: boolean }) {
  const { t } = useTranslation('organizer');
  const { register, control } = useFormContext();

  return (
    <div className="bg-card rounded-lg border p-6 space-y-6">
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="accessCode">{t('access.code')}</Label>
        <Input
          id="accessCode"
          {...register('accessCode')}
          placeholder={t('access.codePlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('access.codeHint')}</p>
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
