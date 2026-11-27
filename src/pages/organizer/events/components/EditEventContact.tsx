import { FormSection } from '../../../../components/ui/form-section';
import { FieldError } from '../../../../components/ui/field-error';
import { useFormContext } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/text-area';
import { Input } from '../../../../components/ui/input';
import { feeLockHint, feeLockShort, type FeeLock } from '../../../../lib/sellerFees';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LabelWithInfo } from '../../../../components/ui/info-tip';

/** In the wizard the commission belongs to the fees, the contact to the details at the end. */
export type ContactPart = 'contact' | 'commission';

export function EditEventContact({
  feeLock = null,
  parts = ['contact', 'commission'],
  bare = false,
}: {
  feeLock?: FeeLock;
  parts?: ContactPart[];
  /** Without its own card, e.g. next to the intake fee */
  bare?: boolean;
}) {
  const { t } = useTranslation('organizer');
  const lockCommission = feeLock === 'running';
  const {
    register,
    formState: { errors },
  } = useFormContext();

  const content = (
    <>
      {parts.includes('contact') && (
        <div className="space-y-2">
          <Label htmlFor="contactInfo">{t('contact.info')}</Label>
          <Textarea
            id="contactInfo"
            {...register('contactInfo')}
            placeholder={t('contact.placeholder')}
            rows={3}
          />
          {errors.contactInfo && <FieldError>{errors.contactInfo.message as string}</FieldError>}
        </div>
      )}

      {parts.includes('commission') && (
        <div className="space-y-2">
          <LabelWithInfo
            htmlFor="commission"
            info={feeLock ? feeLockHint(feeLock) : t('contact.commissionHint')}
          >
            {t('contact.commission')}
          </LabelWithInfo>
          <div className="relative max-w-40">
            <Input
              id="commission"
              type="number"
              step="0.5"
              readOnly={lockCommission}
              aria-readonly={lockCommission}
              className="pr-8"
              {...register('commission', { valueAsNumber: true })}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
          {feeLock && (
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Lock className="size-3" aria-hidden />
              {feeLockShort(feeLock)}
            </p>
          )}
          {errors.commission && <FieldError>{errors.commission.message as string}</FieldError>}
        </div>
      )}
    </>
  );
  if (bare) return content;
  return (
    <FormSection title={parts.includes('contact') ? t('contact.title') : undefined}>
      {content}
    </FormSection>
  );
}
