import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, ConciergeBell, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import { ListSkeleton, Loading } from '../../components/ui/loading';
import { api } from '../../lib/api/functions';
import { useMutation, useQuery } from '../../lib/api/react';
import type { FunctionReturnType } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { TextPair } from './AdminCategoryFields';

type AdminService = FunctionReturnType<typeof api.services.listForAdmin>[number];

function ServiceDialog({
  service,
  onClose,
}: {
  service: AdminService | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('admin');
  const save = useMutation(api.services.save);
  const [name, setName] = useState(service?.name ?? '');
  const [nameEn, setNameEn] = useState(service?.nameEn ?? '');
  const [saving, setSaving] = useState(false);
  const offered = (service?.activeEvents ?? 0) + (service?.pastEvents ?? 0);
  const renamed = !!service && name.trim() !== service.name;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await save({ original: service?.name, name: name.trim(), nameEn: nameEn.trim() });
      toast.success(t('services.saved'));
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
          <DialogTitle>{t(service ? 'services.edit' : 'services.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <TextPair
            id="service-name"
            label={t('services.name')}
            labelEn={t('services.nameEn')}
            value={name}
            valueEn={nameEn}
            onChange={setName}
            onChangeEn={setNameEn}
            hint={
              renamed && offered > 0
                ? t('services.renameHint', { count: offered })
                : t('services.nameEnHint')
            }
            required
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('categories.cancel')}
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {t('categories.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The services bazaars offer, such as parking (#256); organizers pick from them. */
export function AdminServices() {
  const { t } = useTranslation('admin');
  const services = useQuery(api.services.listForAdmin, {});
  const remove = useMutation(api.services.delete);
  const move = useMutation(api.services.move);
  const [editing, setEditing] = useState<{ service: AdminService | null } | null>(null);

  const run = async (action: Promise<unknown>, success?: string) => {
    try {
      await action;
      if (success) toast.success(success);
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    }
  };

  const usage = (service: AdminService) =>
    [
      service.activeEvents > 0 && t('services.active', { count: service.activeEvents }),
      service.pastEvents > 0 && t('services.past', { count: service.pastEvents }),
    ]
      .filter(Boolean)
      .join(' · ') || t('services.unused');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{t('services.intro')}</p>
        <Button onClick={() => setEditing({ service: null })}>
          <Plus className="mr-2 h-4 w-4" />
          {t('services.add')}
        </Button>
      </div>
      {services === undefined ? (
        <Loading>
          <ListSkeleton rows={4} />
        </Loading>
      ) : services.length === 0 ? (
        <EmptyState icon={ConciergeBell} title={t('services.empty')} />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {services.map((service, index) => (
            <li
              key={service.name}
              data-testid={`service-${service.name}`}
              className="flex items-center gap-3 py-2 pl-4 pr-2 md:grid md:grid-cols-[minmax(12rem,1fr)_minmax(10rem,1fr)_auto]"
            >
              <button
                type="button"
                onClick={() => setEditing({ service })}
                className="min-w-0 flex-1 rounded-sm py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block truncate font-medium">{service.name}</span>
                {service.nameEn && (
                  <span lang="en" className="block truncate text-xs text-muted-foreground">
                    {service.nameEn}
                  </span>
                )}
                <span className="block truncate text-xs text-muted-foreground md:hidden">
                  {usage(service)}
                </span>
              </button>
              <span className="hidden text-sm tabular-nums text-muted-foreground md:block">
                {usage(service)}
              </span>
              <div className="flex shrink-0 items-center justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  disabled={index === 0}
                  onClick={() => void run(move({ name: service.name, up: true }))}
                  aria-label={t('services.up', { name: service.name })}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  disabled={index === services.length - 1}
                  onClick={() => void run(move({ name: service.name, up: false }))}
                  aria-label={t('services.down', { name: service.name })}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden h-8 w-8 sm:inline-flex"
                  onClick={() => setEditing({ service })}
                  aria-label={`${t('categories.editShort')}: ${service.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <span title={service.activeEvents > 0 ? t('services.inUse') : undefined}>
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={service.activeEvents > 0}
                        aria-label={`${t('categories.delete')}: ${service.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    }
                    title={t('services.deleteTitle', { name: service.name })}
                    description={
                      service.pastEvents > 0
                        ? t('services.deletePast', { count: service.pastEvents })
                        : t('services.deleteText')
                    }
                    confirmLabel={t('categories.delete')}
                    destructive
                    onConfirm={() => run(remove({ name: service.name }), t('services.deleted'))}
                  />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ServiceDialog
          key={editing.service?.name ?? 'new'}
          service={editing.service}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
