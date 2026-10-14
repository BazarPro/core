import type { ReactNode } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { MAX_DISCOUNT_PERCENT } from '../../../../../convex/eventFeatures';

type FeatureKey =
  | 'discounts'
  | 'priceOffers'
  | 'minimumPrice'
  | 'questions'
  | 'photosOptional'
  | 'priceOnLabel';

function FeatureToggle({
  name,
  title,
  description,
  children,
}: {
  name: FeatureKey;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const { control, watch } = useFormContext();
  const enabled = watch(`features.${name}`) as boolean;
  const id = `feature-${name}`;

  return (
    <div className={`rounded-lg border p-4 ${enabled ? 'bg-primary/5 border-primary/40' : ''}`}>
      <div className="flex items-start gap-3">
        <Controller
          name={`features.${name}`}
          control={control}
          render={({ field }) => (
            <Checkbox
              id={id}
              checked={!!field.value}
              onCheckedChange={(checked: boolean | string) => field.onChange(!!checked)}
              className="mt-0.5"
            />
          )}
        />
        <div className="flex-1 space-y-1">
          <Label htmlFor={id} className="cursor-pointer font-medium">
            {title}
          </Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {enabled && children && <div className="mt-4 pl-7 space-y-4">{children}</div>}
    </div>
  );
}

/** Organizer chooses which buyer and seller features this event offers. */
export function EditEventFeatures() {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext();
  const discounts = watch('features.discounts') as boolean;
  const priceOnLabel = watch('features.priceOnLabel') as boolean;
  const featureErrors = errors.features as
    | Partial<Record<'maxDiscountPercent' | 'discountStartsAt' | 'intakeFee', { message?: string }>>
    | undefined;

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div>
        <h2 className="text-2xl">Funktionen</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Lege fest, was Verkäufer und Käufer bei deiner Veranstaltung nutzen können. Du kannst das
          bis zum Ende der Veranstaltung ändern.
        </p>
      </div>

      <FeatureToggle
        name="discounts"
        title="Artikel rabattieren"
        description="Verkäufer können während der Veranstaltung ihre Preise senken, zum Beispiel gegen Ende des Tages."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="discountStartsAt">Rabatte erst ab (optional)</Label>
            <Input
              id="discountStartsAt"
              type="datetime-local"
              {...register('features.discountStartsAt')}
            />
            <p className="text-xs text-muted-foreground">
              Leer lassen, wenn Rabatte ab Beginn möglich sind.
            </p>
            {featureErrors?.discountStartsAt && (
              <p className="text-sm text-destructive">{featureErrors.discountStartsAt.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxDiscountPercent">Höchstrabatt in %</Label>
            <Input
              id="maxDiscountPercent"
              type="number"
              min={1}
              max={MAX_DISCOUNT_PERCENT}
              {...register('features.maxDiscountPercent', { valueAsNumber: true })}
            />
            {featureErrors?.maxDiscountPercent && (
              <p className="text-sm text-destructive">{featureErrors.maxDiscountPercent.message}</p>
            )}
          </div>
        </div>
      </FeatureToggle>

      <FeatureToggle
        name="priceOffers"
        title="Preisvorschläge online"
        description="Während des Basars schlagen angemeldete Käufer für angenommene Artikel einen Preis vor. Nimmt der Verkäufer an, gilt der Preis an der Kasse. Verkäufer entscheiden pro Artikel, ob sie Vorschläge annehmen."
      />

      <FeatureToggle
        name="minimumPrice"
        title="Verhandeln vor Ort (Mindestpreis / VB)"
        description="Verkäufer hinterlegen pro Artikel einen Mindestpreis, den Käufer nicht sehen. An der Kasse darf bis zu diesem Preis heruntergehandelt werden."
      />

      <FeatureToggle
        name="questions"
        title="Fragen an den Verkäufer"
        description="Käufer stellen öffentlich Fragen zu einem Artikel, der Verkäufer antwortet. Die Antworten sehen alle, das spart doppelte Fragen."
      />

      <FeatureToggle
        name="photosOptional"
        title="Artikel ohne Foto erlauben"
        description="Verkäufer müssen nicht jedes Teil fotografieren – sinnvoll bei vielen kleinen Artikeln wie auf einem Kinderbasar. Artikel ohne Foto zeigen ein Platzhalterbild."
      />

      <div className="space-y-2 rounded-lg border p-4">
        <Label htmlFor="maxItemsPerSeller">Artikel pro Verkäufer (optional)</Label>
        <Input
          id="maxItemsPerSeller"
          type="number"
          min={1}
          className="max-w-40"
          placeholder="unbegrenzt"
          {...register('features.maxItemsPerSeller', { valueAsNumber: true })}
        />
        <p className="text-xs text-muted-foreground">
          Begrenzt, wie viele Artikel ein Verkäufer anmelden kann – damit Annahme und Platz reichen.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <Label htmlFor="intakeFee">Annahmegebühr pro Artikel in € (optional)</Label>
        <Input
          id="intakeFee"
          type="number"
          min={0}
          max={100}
          step={0.5}
          className="max-w-40"
          placeholder="keine"
          {...register('features.intakeFee', { valueAsNumber: true })}
        />
        <p className="text-xs text-muted-foreground">
          Feste Gebühr für jeden angenommenen Artikel, auch wenn er nicht verkauft wird – zum
          Beispiel 3 € pro Rad. Sie wird bei der Abrechnung von der Auszahlung abgezogen, zusätzlich
          zur Provision.
        </p>
        {featureErrors?.intakeFee && (
          <p className="text-sm text-destructive">{featureErrors.intakeFee.message}</p>
        )}
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <Label htmlFor="labelFormat">Etiketten</Label>
        <select
          id="labelFormat"
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          {...register('features.labelFormat')}
        >
          <option value="standard">Groß – 12 pro A4-Seite (z. B. Fahrräder)</option>
          <option value="small">Klein – 40 pro A4-Seite (z. B. Kleidung)</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Auf jedem Etikett stehen QR-Code, Verkäufernummer, Titel und – wenn angegeben – die Größe.
        </p>
      </div>

      <FeatureToggle
        name="priceOnLabel"
        title="Preis aufs Etikett drucken"
        description="Hilft an der Kasse ohne Scanner. Der Preis auf dem Etikett ist fest – bei Rabatten wird er deshalb nicht gedruckt."
      />
      {priceOnLabel && discounts && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Rabatte sind eingeschaltet, deshalb erscheint kein Preis auf den Etiketten.
        </p>
      )}

      <p className="text-xs text-muted-foreground">Bezahlt wird weiterhin vor Ort an der Kasse.</p>
    </div>
  );
}
