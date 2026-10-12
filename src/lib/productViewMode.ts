import type { UserRole } from '../context/UserRoleContext';

/** Management panel shown on the product page for the active role. */
export type ProductPanel = 'seller' | 'organizer' | 'admin';

export interface ProductViewMode {
  /** Tools of the active role, or null when the viewer has none for this item. */
  panel: ProductPanel | null;
  /** Buyer interactions: price offers, questions, reporting. */
  buyerActions: boolean;
  /** Other roles in which the viewer could manage this item. */
  otherRoles: UserRole[];
}

const PANEL_BY_ROLE: Record<UserRole, ProductPanel> = {
  participant: 'seller',
  organizer: 'organizer',
  administrator: 'admin',
};

/**
 * Strict role separation on the product page: each role sees only its own tools.
 * A seller who is also the organizer manages the item as seller in the participant role
 * and as organizer in the organizer role, never both at once.
 */
export function getProductViewMode({
  role,
  isOwner,
  isOrganizer,
  isAdmin,
}: {
  role: UserRole;
  isOwner: boolean;
  isOrganizer: boolean;
  isAdmin: boolean;
}): ProductViewMode {
  const allowed: Record<UserRole, boolean> = {
    participant: isOwner,
    organizer: isOrganizer,
    administrator: isAdmin,
  };
  const panel = allowed[role] ? PANEL_BY_ROLE[role] : null;
  const otherRoles = (Object.keys(allowed) as UserRole[]).filter((r) => r !== role && allowed[r]);

  return { panel, buyerActions: panel === null && !isOwner, otherRoles };
}

export const ROLE_VIEW_LABEL: Record<UserRole, string> = {
  participant: 'Verkäufer',
  organizer: 'Veranstalter',
  administrator: 'Administrator',
};
