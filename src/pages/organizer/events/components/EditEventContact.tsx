import { useFormContext } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/text-area';
import { Input } from '../../../../components/ui/input';

export function EditEventContact({ lockCommission = false }: { lockCommission?: boolean }) {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  return (
    <div className="bg-card rounded-lg border p-6 space-y-6">
      <h2 className="text-2xl">Kontakt & Finanzen</h2>

      <div className="space-y-2">
        <Label htmlFor="contactInfo">Kontaktdaten / Veranstalter-Info *</Label>
        <Textarea
          id="contactInfo"
          {...register('contactInfo')}
          placeholder="E-Mail, Telefon, Website..."
          rows={3}
        />
        {errors.contactInfo && (
          <p className="text-red-500 text-sm">{errors.contactInfo.message as string}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="commission">Provisionsgebühr (%)</Label>
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
          {lockCommission
            ? 'Während der Veranstaltung nicht änderbar, damit alle Verkäufe gleich abgerechnet werden.'
            : 'Prozentsatz, den du von jedem Verkauf einbehältst'}
        </p>
      </div>
    </div>
  );
}
