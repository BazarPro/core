import { useFormContext } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/text-area';
import { Input } from '../../../../components/ui/input';
import { feeLockHint, type FeeLock } from '../../../../lib/sellerFees';
import { useTranslation } from 'react-i18next';

export function EditEventContact({ feeLock = null }: { feeLock?: FeeLock }) {
  const { t } = useTranslation('organizer');
  const lockCommission = feeLock === 'running';
  const {
    register,
    formState: { errors },
  } = useFormContext();

  return (
    <div className="bg-card rounded-lg border p-6 space-y-6">
      <h2 className="text-2xl">{t('contact.title')}</h2>

      <div className="space-y-2">
        <Label htmlFor="contactInfo">{t('contact.info')}</Label>
        <Textarea
          id="contactInfo"
          {...register('contactInfo')}
          placeholder={t('contact.placeholder')}
          rows={3}
        />
        {errors.contactInfo && (
          <p className="text-red-500 text-sm">{errors.contactInfo.message as string}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="commission">{t('contact.commission')}</Label>
        <Input
          id="commission"
          type="number"
          step="0.5"
          readOnly={lockCommission}
          aria-readonly={lockCommission}
          className={lockCommission ? 'opacity-60 cursor-not-allowed' : undefined}
          {...register('commission', { valueAsNumber: true })}
        />
        <p className="text-xs text-muted-foreground">
          {feeLock ? feeLockHint(feeLock) : t('contact.commissionHint')}
        </p>
        {errors.commission && (
          <p className="text-red-500 text-sm">{errors.commission.message as string}</p>
        )}
      </div>
    </div>
  );
}
