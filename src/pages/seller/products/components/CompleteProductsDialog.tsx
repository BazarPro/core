import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog';
import { ImageUpload } from '../../../../components/ui/ImageUpload';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { categoryFieldText } from '../../../../i18n/categoryFields';
import type { Id } from '../../../../../convex/_generated/dataModel';
import type { ProductToComplete } from '../../../../lib/productCompletion';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { formatPriceDE } from '../../../../lib/utils';
import { useTranslation } from 'react-i18next';

/** What the seller added to one item: photos and values of required fields. */
export interface ProductCompletion {
  files: File[];
  attributes: Record<string, string>;
}

interface CompleteProductsDialogProps {
  items: ProductToComplete[];
  /** Saves what was added to one item. */
  onSave: (productId: Id<'products'>, completion: ProductCompletion) => Promise<void>;
  /** All items done; skipped ones are not announced. */
  onFinish: (skipped: Id<'products'>[]) => Promise<void>;
  onCancel: () => void;
}

/**
 * Walks through the items an event cannot accept yet (e.g. without photo or frame
 * number) one by one, before they are announced. Skipped items stay where they are.
 */
export function CompleteProductsDialog({
  items,
  onSave,
  onFinish,
  onCancel,
}: CompleteProductsDialogProps) {
  const { t } = useTranslation('seller');
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Id<'products'>[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const current = items[step];
  if (!current) return null;
  const isLast = step === items.length - 1;
  const needsPhoto = current.missing.includes('photo');
  const missingLabels = [
    ...(needsPhoto ? [t('complete.missing.photo')] : []),
    ...current.fields.map((field) => categoryFieldText(field, 'label') ?? field.label),
  ];
  const complete =
    (!needsPhoto || files.length > 0) && current.fields.every((field) => values[field.key]?.trim());

  const next = async (nextSkipped: Id<'products'>[]) => {
    if (isLast) {
      setIsSaving(true);
      try {
        await onFinish(nextSkipped);
      } finally {
        setIsSaving(false);
      }
      return;
    }
    setSkipped(nextSkipped);
    setFiles([]);
    setValues({});
    setStep(step + 1);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(current.product._id, { files, attributes: values });
    } catch (error) {
      toast.error(t('complete.saveFailed'), {
        description: getUserFacingErrorMessage(error),
      });
      return;
    } finally {
      setIsSaving(false);
    }
    await next(skipped);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isSaving && onCancel()}>
      <DialogContent className="max-w-lg max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('complete.title', { step: step + 1, total: items.length })}</DialogTitle>
          <DialogDescription>
            {t('complete.needs', {
              count: current.eventTitles.length,
              events: current.eventTitles.join(', '),
              missing: missingLabels.join(', '),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border p-3">
            <div className="font-semibold">{current.product.title}</div>
            <div className="text-sm text-muted-foreground">
              {formatPriceDE(current.product.price)} € ·{' '}
              {t('complete.missingList', { missing: missingLabels.join(', ') })}
            </div>
          </div>
          {current.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`complete-${field.key}`}>
                {categoryFieldText(field, 'label') ?? field.label}
              </Label>
              <Input
                id={`complete-${field.key}`}
                maxLength={120}
                placeholder={categoryFieldText(field, 'placeholder')}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
              />
              {categoryFieldText(field, 'hint') && (
                <p className="text-xs text-muted-foreground">{categoryFieldText(field, 'hint')}</p>
              )}
            </div>
          ))}
          {needsPhoto && (
            // A new key per item resets the selected files
            <ImageUpload key={current.product._id} onFilesChange={setFiles} />
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            disabled={isSaving}
            onClick={() => next([...skipped, current.product._id])}
          >
            {t('complete.skip')}
          </Button>
          <Button disabled={isSaving || !complete} onClick={handleSave}>
            {isSaving
              ? t('actions.saving', { ns: 'common' })
              : isLast
                ? t('complete.saveDone')
                : t('complete.saveNext')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
