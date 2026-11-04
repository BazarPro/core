import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
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
import { TableRowsSkeleton } from '../../components/ui/loading';
import { PageHeader } from '../../components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { categoryFieldText } from '../../i18n/categoryFields';
import { api } from '../../lib/api/functions';
import { useMutation, useQuery } from '../../lib/api/react';
import type { FunctionReturnType } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';
import {
  getCategoryFields,
  getFieldsForLabel,
  type CategoryField,
} from '../../shared/categoryFields';

type AdminCategory = FunctionReturnType<typeof api.categories.listForAdmin>[number];
/** What the dialog works on: a category, or null for a new one. */
type Editing = { category: AdminCategory | null };

const fieldNames = (fields: CategoryField[]) =>
  fields.map((field) => categoryFieldText(field, 'label') ?? field.label);

/** By name, parents first, each followed by its sub-categories. */
function inTreeOrder(unsorted: AdminCategory[]) {
  const categories = [...unsorted].sort((a, b) => a.label.localeCompare(b.label));
  const ids = new Set(categories.map((category) => category._id));
  const isRoot = (category: AdminCategory) =>
    !category.parentCategory || !ids.has(category.parentCategory);
  const withChildren = (parent: AdminCategory, seen: Set<string>): AdminCategory[] => {
    seen.add(parent._id);
    return [
      parent,
      ...categories
        .filter((category) => category.parentCategory === parent._id && !seen.has(category._id))
        .flatMap((child) => withChildren(child, seen)),
    ];
  };
  const seen = new Set<string>();
  return categories.filter(isRoot).flatMap((root) => withChildren(root, seen));
}

function CategoryDialog({
  editing,
  categories,
  onClose,
}: {
  editing: Editing;
  categories: AdminCategory[];
  onClose: () => void;
}) {
  const { t } = useTranslation('admin');
  const { category } = editing;
  const create = useMutation(api.categories.createCategory);
  const update = useMutation(api.categories.updateCategory);
  const [label, setLabel] = useState(category?.label ?? '');
  const [nameEn, setNameEn] = useState(category?.translations.en ?? '');
  const [saving, setSaving] = useState(false);

  const name = label.trim();
  const fieldsFor = (candidate: string) =>
    getFieldsForLabel(candidate) ??
    (category?.parentCategory ? getCategoryFields(category.parentCategory, categories) : []);
  const fields = fieldNames(fieldsFor(name));
  const fieldsChange =
    !!category &&
    (category.productCount > 0 || category.eventCount > 0) &&
    fields.join() !== fieldNames(fieldsFor(category.label)).join();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const isTaken = categories.some(
      (other) => other._id !== category?._id && other.label.toLowerCase() === name.toLowerCase()
    );
    if (isTaken) {
      toast.error(t('categories.duplicate'));
      return;
    }
    setSaving(true);
    try {
      const translations = { en: nameEn.trim() || undefined };
      if (category) await update({ categoryId: category._id, label: name, translations });
      else await create({ label: name, translations });
      toast.success(t('categories.saved'));
      onClose();
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(category ? 'categories.edit' : 'categories.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">{t('categories.name')}</Label>
            <Input
              id="category-name"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={60}
              required
              autoFocus
            />
            <p className="text-sm text-muted-foreground">{t('categories.fieldsHint')}</p>
            {name && (
              <p className="text-sm">
                {fields.length
                  ? t('categories.fieldsPreview', { fields: fields.join(', ') })
                  : t('categories.noFieldsPreview')}
              </p>
            )}
            {fieldsChange && (
              <p className="text-sm text-destructive">{t('categories.fieldsChange')}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-name-en">{t('categories.nameEn')}</Label>
            <Input
              id="category-name-en"
              lang="en"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              maxLength={60}
            />
            <p className="text-sm text-muted-foreground">{t('categories.nameEnHint')}</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !name}>
              {t('categories.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The product categories: names in each language, their extra fields and what uses them. */
export function AdminCategoriesPage() {
  const { t } = useTranslation('admin');
  const categories = useQuery(api.categories.listForAdmin, {});
  const remove = useMutation(api.categories.deleteCategory);
  const [editing, setEditing] = useState<Editing | null>(null);

  const handleDelete = async (category: AdminCategory) => {
    try {
      await remove({ categoryId: category._id });
      toast.success(t('categories.deleted'));
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    }
  };

  const whyNotDeletable = (category: AdminCategory) => {
    if (category.productCount || category.eventCount || category.childCount) {
      return t('categories.inUse');
    }
    return categories?.length === 1 ? t('categories.lastOne') : undefined;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('categories.title')}
        description={t('categories.subtitle')}
        actions={
          <Button onClick={() => setEditing({ category: null })}>
            <Plus className="mr-2 h-4 w-4" />
            {t('categories.add')}
          </Button>
        }
      />

      {categories?.length === 0 ? (
        <EmptyState icon={Tags} title={t('categories.empty')} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('categories.name')}</TableHead>
                <TableHead>{t('categories.nameEn')}</TableHead>
                <TableHead>{t('categories.fields')}</TableHead>
                <TableHead>{t('categories.usage')}</TableHead>
                <TableHead className="text-right">{t('categories.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!categories ? (
                <TableRowsSkeleton columns={5} />
              ) : (
                inTreeOrder(categories).map((category) => {
                  const parent = categories.find((c) => c._id === category.parentCategory);
                  const fields = fieldNames(getCategoryFields(category._id, categories));
                  const blocked = whyNotDeletable(category);
                  return (
                    <TableRow key={category._id}>
                      <TableCell className={parent ? 'min-w-[12rem] pl-8' : 'min-w-[12rem]'}>
                        <div className="font-medium">{category.label}</div>
                        {parent && (
                          <div className="text-xs text-muted-foreground">
                            {t('categories.subOf', { parent: parent.label })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{category.translations.en ?? '—'}</TableCell>
                      <TableCell className="min-w-[10rem]">
                        {fields.length ? (
                          <div className="flex flex-wrap gap-1">
                            {fields.map((field) => (
                              <Badge key={field} variant="outline">
                                {field}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('categories.noFields')}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {t('categories.usageProducts', { count: category.productCount })},{' '}
                        {t('categories.usageEvents', { count: category.eventCount })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing({ category })}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            {t('categories.editShort')}
                          </Button>
                          {/* A disabled button shows no tooltip itself */}
                          <span title={blocked}>
                            <ConfirmDialog
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!!blocked}
                                  aria-label={`${t('categories.delete')}: ${category.label}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              }
                              title={t('categories.deleteTitle', { name: category.label })}
                              description={t('categories.deleteText')}
                              confirmLabel={t('categories.delete')}
                              destructive
                              onConfirm={() => handleDelete(category)}
                            />
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && categories && (
        <CategoryDialog
          key={editing.category?._id ?? 'new'}
          editing={editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
