import { useState, type FormEvent } from 'react';
import { ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { api } from '../../lib/api/functions';
import { useMutation, useQuery } from '../../lib/api/react';
import type { FunctionReturnType } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';

type AdminField = FunctionReturnType<typeof api.categories.listFieldsForAdmin>[number];

/** A German and an English input side by side. */
export function TextPair({
  id,
  label,
  labelEn,
  value,
  valueEn,
  onChange,
  onChangeEn,
  hint,
  required = false,
}: {
  id: string;
  label: string;
  labelEn: string;
  value: string;
  valueEn: string;
  onChange: (value: string) => void;
  onChangeEn: (value: string) => void;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            maxLength={120}
            required={required}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-en`}>{labelEn}</Label>
          <Input
            id={`${id}-en`}
            lang="en"
            value={valueEn}
            onChange={(event) => onChangeEn(event.target.value)}
            maxLength={120}
          />
        </div>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FieldDialog({ field, onClose }: { field: AdminField | null; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const save = useMutation(api.categories.saveField);
  const [values, setValues] = useState({
    label: field?.label ?? '',
    labelEn: field?.labelEn ?? '',
    placeholder: field?.placeholder ?? '',
    placeholderEn: field?.placeholderEn ?? '',
    hint: field?.hint ?? '',
    hintEn: field?.hintEn ?? '',
    short: field?.short ?? false,
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await save({ fieldId: field?._id, ...values });
      toast.success(t('categoryFields.saved'));
      onClose();
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(field ? 'categoryFields.edit' : 'categoryFields.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <TextPair
            id="field-label"
            label={t('categoryFields.label')}
            labelEn={t('categoryFields.labelEn')}
            value={values.label}
            valueEn={values.labelEn}
            onChange={set('label')}
            onChangeEn={set('labelEn')}
            required
          />
          <TextPair
            id="field-placeholder"
            label={t('categoryFields.placeholder')}
            labelEn={t('categoryFields.placeholderEn')}
            value={values.placeholder}
            valueEn={values.placeholderEn}
            onChange={set('placeholder')}
            onChangeEn={set('placeholderEn')}
            hint={t('categoryFields.placeholderHint')}
          />
          <TextPair
            id="field-hint"
            label={t('categoryFields.hint')}
            labelEn={t('categoryFields.hintEn')}
            value={values.hint}
            valueEn={values.hintEn}
            onChange={set('hint')}
            onChangeEn={set('hintEn')}
          />
          <label htmlFor="field-short" className="flex cursor-pointer items-start gap-3">
            <Checkbox
              id="field-short"
              checked={values.short}
              onCheckedChange={(on) => setValues((current) => ({ ...current, short: on === true }))}
              className="mt-0.5"
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t('categoryFields.short')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('categoryFields.shortHint')}
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('categories.cancel')}
            </Button>
            <Button type="submit" disabled={saving || !values.label.trim()}>
              {t('categories.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The extra fields admins define; categories pick from them. */
export function AdminCategoryFields() {
  const { t } = useTranslation('admin');
  const fields = useQuery(api.categories.listFieldsForAdmin, {});
  const remove = useMutation(api.categories.deleteField);
  const [editing, setEditing] = useState<{ field: AdminField | null } | null>(null);

  const handleDelete = async (field: AdminField) => {
    try {
      await remove({ fieldId: field._id });
      toast.success(t('categoryFields.deleted'));
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{t('categoryFields.intro')}</p>
        <Button onClick={() => setEditing({ field: null })}>
          <Plus className="mr-2 h-4 w-4" />
          {t('categoryFields.add')}
        </Button>
      </div>
      {fields?.length === 0 ? (
        <EmptyState icon={ListPlus} title={t('categoryFields.empty')} />
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {(fields ?? []).map((field) => (
            <div
              key={field._id}
              data-testid={`field-${field.label}`}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(12rem,1fr)_1.5fr_auto_auto]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  {field.label}
                  {field.short && (
                    <Badge variant="secondary" className="font-normal">
                      {t('categoryFields.shortBadge')}
                    </Badge>
                  )}
                </div>
                {field.labelEn && (
                  <div className="truncate text-xs text-muted-foreground">{field.labelEn}</div>
                )}
              </div>
              <div className="col-span-2 row-start-2 truncate text-sm text-muted-foreground md:col-span-1 md:row-start-auto">
                {field.placeholder ?? '—'}
              </div>
              <div className="hidden whitespace-nowrap text-sm text-muted-foreground md:block">
                {field.categoryCount
                  ? t('categoryFields.used', { count: field.categoryCount })
                  : t('categoryFields.unused')}
              </div>
              <div className="col-start-2 row-start-1 flex justify-end gap-1 md:col-start-auto md:row-start-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing({ field })}
                  aria-label={`${t('categories.editShort')}: ${field.label}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{t('categories.editShort')}</span>
                </Button>
                <span title={field.categoryCount ? t('categoryFields.inUse') : undefined}>
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={field.categoryCount > 0}
                        aria-label={`${t('categories.delete')}: ${field.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    }
                    title={t('categoryFields.deleteTitle', { name: field.label })}
                    description={t('categoryFields.deleteText')}
                    confirmLabel={t('categories.delete')}
                    destructive
                    onConfirm={() => handleDelete(field)}
                  />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <FieldDialog
          key={editing.field?._id ?? 'new'}
          field={editing.field}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
