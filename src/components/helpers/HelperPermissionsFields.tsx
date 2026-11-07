import { useTranslation } from 'react-i18next';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { HELPER_PERMISSIONS, type HelperPermission } from '../../shared/constants';

/**
 * What a helper may do at the bazaar, one checkbox per permission: when appointing and
 * later per helper. Organizers and admins may always do everything.
 */
export function HelperPermissionsFields({
  value,
  onChange,
}: {
  value: HelperPermission[];
  onChange: (value: HelperPermission[]) => void;
}) {
  const { t } = useTranslation('organizer');
  return (
    <fieldset className="space-y-2 rounded-lg bg-muted p-4 text-sm">
      <legend className="sr-only">{t('sellers.permissionsLegend')}</legend>
      {HELPER_PERMISSIONS.map((permission) => {
        const id = `helper-permission-${permission}`;
        return (
          <div key={permission} className="flex items-start gap-3">
            <Checkbox
              id={id}
              checked={value.includes(permission)}
              onCheckedChange={(checked: boolean | string) =>
                onChange(
                  HELPER_PERMISSIONS.filter((p) =>
                    p === permission ? !!checked : value.includes(p)
                  )
                )
              }
              className="mt-0.5"
            />
            <Label htmlFor={id} className="cursor-pointer font-normal leading-snug">
              {t(`sellers.permissions.${permission}`)}
            </Label>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted-foreground">{t('sellers.permissionsAlways')}</p>
    </fieldset>
  );
}
