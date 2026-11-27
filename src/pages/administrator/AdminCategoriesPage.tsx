import { useState, type FormEvent } from 'react';
import { ChevronRight, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
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
import { TableRowsSkeleton } from '../../components/ui/loading';
import { PageHeader } from '../../components/ui/page-header';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { categoryFieldText } from '../../i18n/categoryFields';
import { api } from '../../lib/api/functions';
import { useMutation, useQuery } from '../../lib/api/react';
import type { FunctionReturnType, Id } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';
import type { CategoryField } from '../../shared/categoryFields';
import { groupCategories } from '../../shared/categoryTree';
import { AdminCategoryFields } from './AdminCategoryFields';
import { AdminServices } from './AdminServices';

type AdminCategory = FunctionReturnType<typeof api.categories.listForAdmin>[number];
/** Value of the parent select for a main category */
const NO_PARENT = 'none';

/** What the dialog works on: a category, or a new one (maybe below a main category). */
type Editing = { category: AdminCategory } | { parent?: string };

const fieldNames = (fields: CategoryField[]) =>
  fields.map((field) => categoryFieldText(field, 'label') ?? field.label);

function CategoryDialog({
  editing,
  categories,
  definitions,
  onClose,
}: {
  editing: Editing;
  categories: AdminCategory[];
  definitions: CategoryField[];
  onClose: () => void;
}) {
  const { t } = useTranslation('admin');
  const category = 'category' in editing ? editing.category : undefined;
  const create = useMutation(api.categories.createCategory);
  const update = useMutation(api.categories.updateCategory);
  const [label, setLabel] = useState(category?.label ?? '');
  const [nameEn, setNameEn] = useState(category?.translations.en ?? '');
  const [parent, setParent] = useState(
    category?.parentCategory ?? ('parent' in editing ? editing.parent : undefined) ?? NO_PARENT
  );
  // One level: only main categories take sub-categories, and one with its own stays on top
  const mainCategories = categories.filter(
    (other) => !other.parentCategory && other._id !== category?._id
  );
  const hasChildren = (category?.childCount ?? 0) > 0;
  const parentCategory = categories.find((other) => other._id === parent);
  // Ids of the picked fields; undefined: those of the main category
  const [picked, setPicked] = useState<string[] | undefined>(
    category?.fields ?? (parentCategory ? undefined : [])
  );
  const [saving, setSaving] = useState(false);

  const name = label.trim();
  const inherited = parentCategory?.fieldList ?? [];
  const ownChoice = picked ?? inherited.map((field) => field._id);
  const effective = definitions.filter((field) =>
    (picked ?? inherited.map((f) => f._id)).includes(field._id)
  );
  const fieldsChange =
    !!category &&
    (category.productCount > 0 || category.eventCount > 0) &&
    fieldNames(effective).join() !== fieldNames(category.fieldList).join();

  const chooseParent = (value: string) => {
    setParent(value);
    // On top there is nothing to take over
    if (value === NO_PARENT && picked === undefined) setPicked(inherited.map((f) => f._id));
  };
  const toggle = (field: CategoryField, on: boolean) =>
    setPicked(
      on
        ? // One size at most: all sizes share the key
          [
            ...ownChoice.filter(
              (id) => definitions.find((other) => other._id === id)?.key !== field.key
            ),
            field._id,
          ]
        : ownChoice.filter((id) => id !== field._id)
    );

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
      const args = {
        label: name,
        translations: { en: nameEn.trim() || undefined },
        parentCategory: parentCategory?._id as Id<'categories'> | undefined,
        fields: parentCategory ? picked : ownChoice,
      };
      if (category) await update({ categoryId: category._id, ...args });
      else await create(args);
      toast.success(t('categories.saved'));
      onClose();
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const sizes = definitions.filter((field) => field.key === 'size').length;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(
              category ? 'categories.edit' : parentCategory ? 'categories.newSub' : 'categories.new'
            )}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-parent">{t('categories.parent')}</Label>
            <Select value={parent} onValueChange={chooseParent} disabled={hasChildren}>
              <SelectTrigger id="category-parent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>{t('categories.noParent')}</SelectItem>
                {mainCategories.map((main) => (
                  <SelectItem key={main._id} value={main._id}>
                    {main.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t(hasChildren ? 'categories.parentLocked' : 'categories.parentHint')}
            </p>
          </div>

          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">{t('categories.fields')}</legend>
            <p className="text-sm text-muted-foreground">{t('categories.fieldsHelp')}</p>
            {parentCategory && (
              <RadioGroup
                value={picked ? 'own' : 'inherit'}
                onValueChange={(value) =>
                  setPicked(value === 'own' ? inherited.map((f) => f._id) : undefined)
                }
                className="gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="inherit" id="fields-inherit" />
                  <Label htmlFor="fields-inherit" className="font-normal">
                    {inherited.length
                      ? t('categories.inheritFields', {
                          name: parentCategory.label,
                          fields: fieldNames(inherited).join(', '),
                        })
                      : t('categories.inheritNone', { name: parentCategory.label })}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="own" id="fields-own" />
                  <Label htmlFor="fields-own" className="font-normal">
                    {t('categories.own')}
                  </Label>
                </div>
              </RadioGroup>
            )}
            {(!parentCategory || picked) && (
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {definitions.map((field) => (
                  <label
                    key={field._id}
                    htmlFor={`category-field-${field._id}`}
                    className="flex cursor-pointer items-start gap-2 rounded-md py-1"
                  >
                    <Checkbox
                      id={`category-field-${field._id}`}
                      checked={ownChoice.includes(field._id)}
                      onCheckedChange={(on) => toggle(field, on === true)}
                      className="mt-0.5"
                    />
                    <span className="text-sm leading-tight">
                      {categoryFieldText(field, 'label') ?? field.label}
                      {field.placeholder && (
                        <span className="block text-xs text-muted-foreground">
                          {categoryFieldText(field, 'placeholder')}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {(!parentCategory || picked) && (
              <p className="text-xs text-muted-foreground">
                {sizes > 1 && `${t('categories.oneSize')} `}
                {t('categories.manageFields')}
              </p>
            )}
            {fieldsChange && (
              <p className="text-sm text-destructive">{t('categories.fieldsChange')}</p>
            )}
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('categories.cancel')}
            </Button>
            <Button type="submit" disabled={saving || !name}>
              {t('categories.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The fields of a row: its own, or "like the main category" for a sub-category. */
function FieldsOf({ category, parent }: { category: AdminCategory; parent?: AdminCategory }) {
  const { t } = useTranslation('admin');
  if (parent && !category.fields) {
    return (
      <span className="text-sm text-muted-foreground">
        {t('categories.inherit', { name: parent.label })}
      </span>
    );
  }
  if (category.fieldList.length === 0) {
    return <span className="text-sm text-muted-foreground">{t('categories.noFields')}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {fieldNames(category.fieldList).map((field) => (
        <Badge key={field} variant="outline" className="font-normal">
          {field}
        </Badge>
      ))}
    </div>
  );
}

function CategoryRow({
  category,
  categories,
  sub = false,
  childCount,
  open,
  onToggle,
  onEdit,
  onAddSub,
}: {
  category: AdminCategory;
  categories: AdminCategory[];
  sub?: boolean;
  childCount: number;
  open?: boolean;
  onToggle?: () => void;
  onEdit: () => void;
  onAddSub?: () => void;
}) {
  const { t } = useTranslation('admin');
  const remove = useMutation(api.categories.deleteCategory);
  const blocked =
    category.productCount || category.eventCount || category.childCount
      ? t('categories.inUse')
      : categories.length === 1
        ? t('categories.lastOne')
        : undefined;
  const handleDelete = async () => {
    try {
      await remove({ categoryId: category._id });
      toast.success(t('categories.deleted'));
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    }
  };

  return (
    <div
      data-testid={`category-${category.label}`}
      className={cn(
        'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 md:grid-cols-[minmax(12rem,1.2fr)_2fr_9.5rem_6.75rem]',
        sub && 'bg-muted/30 pl-12'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {!sub &&
          (childCount > 0 ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-label={t('categories.showSub', { name: category.label })}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-5" />
          ))}
        <div className="min-w-0">
          <button
            type="button"
            onClick={onEdit}
            tabIndex={-1}
            className="block max-w-full cursor-pointer truncate text-left font-medium hover:underline"
          >
            {category.label}
          </button>
          <div className="truncate text-xs text-muted-foreground">
            {[
              category.translations.en,
              !sub && childCount > 0 && t('categories.subcategories', { count: childCount }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>
      <div
        className={cn(
          'col-span-2 row-start-2 md:col-span-1 md:row-start-auto',
          !sub && 'pl-7 md:pl-0'
        )}
      >
        <FieldsOf
          category={category}
          parent={categories.find((other) => other._id === category.parentCategory)}
        />
      </div>
      <div className="hidden whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground md:block">
        {t('categories.usageProducts', { count: category.productCount })} ·{' '}
        {t('categories.usageEvents', { count: category.eventCount })}
      </div>
      <div className="col-start-2 row-start-1 -mr-2 flex justify-end md:col-start-auto md:row-start-auto">
        {onAddSub && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={onAddSub}
            aria-label={t('categories.addSubTo', { name: category.label })}
            title={t('categories.addSub')}
          >
            <Plus />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={onEdit}
          aria-label={`${t('categories.editShort')}: ${category.label}`}
          title={t('categories.editShort')}
        >
          <Pencil />
        </Button>
        {/* A disabled button shows no tooltip itself */}
        <span title={blocked}>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                disabled={!!blocked}
                aria-label={`${t('categories.delete')}: ${category.label}`}
              >
                <Trash2 />
              </Button>
            }
            title={t('categories.deleteTitle', { name: category.label })}
            description={t('categories.deleteText')}
            confirmLabel={t('categories.delete')}
            destructive
            onConfirm={handleDelete}
          />
        </span>
      </div>
    </div>
  );
}

function CategoryTree({
  categories,
  onEdit,
}: {
  categories: AdminCategory[];
  onEdit: (editing: Editing) => void;
}) {
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (id: string) =>
    setOpen((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id]
    );
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      {groupCategories(categories).map(({ category, children }) => (
        <div key={category._id} className="divide-y">
          <CategoryRow
            category={category}
            categories={categories}
            childCount={children.length}
            open={open.includes(category._id)}
            onToggle={() => toggle(category._id)}
            onEdit={() => onEdit({ category })}
            onAddSub={() => {
              setOpen((current) => [...new Set([...current, category._id])]);
              onEdit({ parent: category._id });
            }}
          />
          {open.includes(category._id) &&
            children.map((child) => (
              <CategoryRow
                key={child._id}
                category={child}
                categories={categories}
                sub
                childCount={0}
                onEdit={() => onEdit({ category: child })}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

/** The product categories, the extra fields their items have and the bazaars' services. */
export function AdminCategoriesPage() {
  const { t } = useTranslation('admin');
  const categories = useQuery(api.categories.listForAdmin, {});
  const definitions = useQuery(api.categories.listFields, {});
  const [tab, setTab] = useState('categories');
  const [editing, setEditing] = useState<Editing | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title={t('categories.title')} description={t('categories.subtitle')} />
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="categories">{t('categories.tabCategories')}</TabsTrigger>
            <TabsTrigger value="fields">{t('categories.tabFields')}</TabsTrigger>
            <TabsTrigger value="services">{t('categories.tabServices')}</TabsTrigger>
          </TabsList>
          {tab === 'categories' && (
            <Button onClick={() => setEditing({})}>
              <Plus className="mr-2 h-4 w-4" />
              {t('categories.add')}
            </Button>
          )}
        </div>

        <TabsContent value="categories">
          {categories?.length === 0 ? (
            <EmptyState icon={Tags} title={t('categories.empty')} />
          ) : !categories ? (
            <table className="w-full">
              <tbody>
                <TableRowsSkeleton columns={4} />
              </tbody>
            </table>
          ) : (
            <CategoryTree categories={categories} onEdit={setEditing} />
          )}
        </TabsContent>
        <TabsContent value="fields">
          <AdminCategoryFields />
        </TabsContent>
        <TabsContent value="services">
          <AdminServices />
        </TabsContent>
      </Tabs>

      {editing && categories && definitions && (
        <CategoryDialog
          key={'category' in editing ? editing.category._id : `new-${editing.parent ?? ''}`}
          editing={editing}
          categories={categories}
          definitions={definitions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
