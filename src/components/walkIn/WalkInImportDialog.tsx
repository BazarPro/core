import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../../lib/api/functions';
import { useMutation, useQuery } from '../../lib/api/react';
import type { Id } from '../../lib/api/types';
import { categoryName } from '../../i18n/categories';
import { CONDITION_OPTIONS } from '../../constants/records';
import { PRODUCT_CONDITIONS, type ProductContitions } from '../../shared/constants';
import { formatPriceDE } from '../../lib/utils';
import { getUserFacingErrorMessage } from '../../lib/errors';
import {
  buildImportRows,
  type CsvTable,
  decodeCsv,
  guessTargets,
  IMPORT_TARGETS,
  type ImportProblem,
  type ImportTarget,
  MAX_IMPORT_ITEMS,
  parseCsv,
} from '../../lib/csvImport';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { NativeSelect } from '../ui/native-select';

/** Shown problems; the rest is counted */
const MAX_LISTED_PROBLEMS = 20;
/** Items in the preview table */
const MAX_PREVIEW = 50;

/** The bytes of the file; FileReader also works where File.arrayBuffer is missing */
function readBytes(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Organizer imports the items of a walk-in seller from a CSV file, e.g. the stock list
 * of a shop (#241): columns are mapped freely, category and condition can be set for
 * the whole file. Rows that cannot become items are listed and skipped.
 */
export function WalkInImportDialog({
  eventId,
  sellerId,
  sellerName,
  open,
  onOpenChange,
}: {
  eventId: Id<'events'>;
  sellerId: Id<'users'>;
  sellerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('organizer');
  const categories = useQuery(api.categories.getAllCategories);
  const importProducts = useMutation(api.walkInSellers.importWalkInProducts);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [targets, setTargets] = useState<ImportTarget[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState<ProductContitions>('new');
  const [readError, setReadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setTable(null);
    setTargets([]);
    setReadError(null);
  };

  const onFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    try {
      const parsed = parseCsv(decodeCsv(await readBytes(file)));
      if (parsed.rows.length === 0) {
        setReadError(t('walkIn.import.noRows'));
        return;
      }
      setTable(parsed);
      setTargets(guessTargets(parsed.header));
    } catch {
      setReadError(t('walkIn.import.readFailed'));
    }
  };

  const sortedCategories = useMemo(
    () => [...(categories ?? [])].sort((a, b) => categoryName(a).localeCompare(categoryName(b))),
    [categories]
  );

  const rows = useMemo(() => {
    if (!table || !categories) return [];
    const titles = Object.fromEntries(
      PRODUCT_CONDITIONS.map((c) => [c, CONDITION_OPTIONS[c].title])
    ) as Record<ProductContitions, string>;
    return buildImportRows(
      table,
      targets,
      { categoryId: categoryId || undefined, condition },
      categories,
      titles
    );
  }, [table, targets, categoryId, condition, categories]);

  const items = rows.flatMap((row) => (row.item ? [row.item] : []));
  const problems = rows.flatMap((row) => (row.problem ? [row] : []));
  const tooMany = items.length > MAX_IMPORT_ITEMS;
  const categoryById = new Map(categories?.map((c) => [c._id, c]));

  const describe = (problem: ImportProblem) =>
    t(`walkIn.import.problems.${problem.code}`, problem as Record<string, unknown>);

  const setTarget = (column: number, target: ImportTarget) => {
    setTargets((current) =>
      current.map((old, i) => {
        if (i === column) return target;
        // Every meaning except the description belongs to one column only
        return old === target && target !== 'description' && target !== 'ignore' ? 'ignore' : old;
      })
    );
  };

  const onImport = async () => {
    setImporting(true);
    try {
      const count = await importProducts({
        eventId,
        sellerId,
        items: items.map((item) => ({
          ...item,
          productCategory: item.productCategory as Id<'categories'>,
        })),
      });
      toast.success(t('walkIn.import.done', { count }));
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(t('walkIn.import.failed'), {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('walkIn.import.title', { name: sellerName })}</DialogTitle>
          <DialogDescription>{t('walkIn.import.text')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="walk-in-import-file">{t('walkIn.import.file')}</Label>
          <Input
            id="walk-in-import-file"
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {readError && <p className="text-sm text-destructive">{readError}</p>}
        </div>

        {table && (
          <>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t('walkIn.import.columns')}</h3>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('walkIn.import.column')}</th>
                      <th className="px-3 py-2 font-medium">{t('walkIn.import.example')}</th>
                      <th className="px-3 py-2 font-medium">{t('walkIn.import.meaning')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.header.map((name, column) => (
                      <tr key={column} className="border-t">
                        <td className="px-3 py-2">{name || `#${column + 1}`}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {table.rows[0]?.[column] ?? ''}
                        </td>
                        <td className="px-3 py-1">
                          <NativeSelect
                            aria-label={name}
                            value={targets[column]}
                            onChange={(e) => setTarget(column, e.target.value as ImportTarget)}
                          >
                            {IMPORT_TARGETS.map((target) => (
                              <option key={target} value={target}>
                                {t(`walkIn.import.targets.${target}`)}
                              </option>
                            ))}
                          </NativeSelect>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t('walkIn.import.defaults')}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="walk-in-import-category">
                    {t('walkIn.import.defaultCategory')}
                  </Label>
                  <NativeSelect
                    id="walk-in-import-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">{t('walkIn.import.choose')}</option>
                    {sortedCategories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {categoryName(c)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="walk-in-import-condition">
                    {t('walkIn.import.defaultCondition')}
                  </Label>
                  <NativeSelect
                    id="walk-in-import-condition"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as ProductContitions)}
                  >
                    {PRODUCT_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {CONDITION_OPTIONS[c].title}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-sm font-medium">
                {t('walkIn.import.ready', { count: items.length })}
              </p>
              {problems.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium">
                    {t('walkIn.import.skipped', { count: problems.length })}
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {problems.slice(0, MAX_LISTED_PROBLEMS).map((row) => (
                      <li key={row.line}>
                        {t('walkIn.import.line', {
                          line: row.line,
                          problem: describe(row.problem!),
                        })}
                      </li>
                    ))}
                  </ul>
                  {problems.length > MAX_LISTED_PROBLEMS && (
                    <p className="mt-1 text-muted-foreground">
                      {t('walkIn.import.moreProblems', {
                        count: problems.length - MAX_LISTED_PROBLEMS,
                      })}
                    </p>
                  )}
                </div>
              )}
              {tooMany && (
                <p className="text-sm text-destructive">
                  {t('walkIn.import.tooMany', { max: MAX_IMPORT_ITEMS })}
                </p>
              )}
              {items.length > 0 && (
                <div className="max-h-64 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t('walkIn.import.preview')}</caption>
                    <thead className="sticky top-0 bg-muted text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">
                          {t('walkIn.import.targets.title')}
                        </th>
                        <th className="px-3 py-2 font-medium">
                          {t('walkIn.import.targets.category')}
                        </th>
                        <th className="px-3 py-2 font-medium">{t('walkIn.import.targets.size')}</th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t('walkIn.import.targets.price')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, MAX_PREVIEW).map((item, i) => {
                        const category = categoryById.get(item.productCategory as Id<'categories'>);
                        return (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-1.5">{item.title}</td>
                            <td className="px-3 py-1.5">
                              {category ? categoryName(category) : ''}
                            </td>
                            <td className="px-3 py-1.5">{item.attributes?.size ?? ''}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {formatPriceDE(item.price)} €
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        <DialogFooter className="mt-2">
          <Button
            disabled={!table || items.length === 0 || tooMany || importing}
            onClick={() => void onImport()}
          >
            {importing
              ? t('walkIn.import.importing')
              : t('walkIn.import.submit', { count: items.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
