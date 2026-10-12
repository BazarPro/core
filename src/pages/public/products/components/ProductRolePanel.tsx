import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { useUserRole, type UserRole } from '../../../../context/UserRoleContext';
import { ROLE_VIEW_LABEL } from '../../../../lib/productViewMode';
import { cn } from '../../../../lib/utils';

/** Frame for the management tools of one role on the product page. */
export function ProductRolePanel({
  icon: Icon,
  title,
  role,
  children,
  className,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  role: UserRole;
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
        <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {ROLE_VIEW_LABEL[role]}-Ansicht
        </span>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

/** Points to the roles in which the viewer could manage this item, without leaving the page. */
export function ProductRoleSwitchHint({ roles }: { roles: UserRole[] }) {
  const { setRoleOnly } = useUserRole();
  if (roles.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground"
      data-testid="product-role-switch"
    >
      <ArrowRightLeft className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-48">
        Du kannst diesen Artikel in einer anderen Rolle verwalten.
      </span>
      <div className="flex flex-wrap gap-2">
        {roles.map((role) => (
          <Button key={role} size="sm" variant="outline" onClick={() => setRoleOnly(role)}>
            Als {ROLE_VIEW_LABEL[role]}
          </Button>
        ))}
      </div>
    </div>
  );
}
