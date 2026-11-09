import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '../ui/label';
import { Textarea } from '../ui/text-area';

/** Same limit as the backend (event_exclusions, event_products) */
export const MAX_REASON_LENGTH = 500;

/**
 * Optional reason for a decision about a seller or an item, e.g. inside a ConfirmDialog.
 * The seller reads it in the app and in the mail.
 */
export function ReasonField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation('organizer');
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('participation.reason')}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={MAX_REASON_LENGTH}
      />
      <p className="text-xs text-muted-foreground">{t('participation.reasonHint')}</p>
    </div>
  );
}
