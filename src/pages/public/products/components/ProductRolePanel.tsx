import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { useUserRole, type UserRole } from '../../../../context/UserRoleContext';
import { cn } from '../../../../lib/utils';
import { useTranslation } from 'react-i18next';

/** Frame for the management tools of one role on the product page. */
export function ProductRolePanel({
  icon: Icon,
  title,
  children,
  className,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={cn('rounded-2xl border bg-card shadow-sm overflow-hidden', className)}
      data-testid={testId}
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-5 py-3">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

/** Switches the view of the product page between the viewer's roles, without leaving it. */
export function ProductRoleSwitch({ roles }: { roles: UserRole[] }) {
  const { t } = useTranslation('product');
  const { role: current, setRoleOnly } = useUserRole();
  if (roles.length < 2) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground"
      data-testid="product-role-switch"
    >
      <ArrowRightLeft className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-48">{t('roles.viewAs')}</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('roles.switch')}>
        {roles.map((role) => (
          <Button
            key={role}
            size="sm"
            variant={role === current ? 'secondary' : 'outline'}
            aria-pressed={role === current}
            onClick={() => setRoleOnly(role)}
          >
            {t(`roles.${role}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
