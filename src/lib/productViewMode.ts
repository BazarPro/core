import type { UserRole } from '../context/UserRoleContext';

/** Management panel shown on the product page for the active role. */
export type ProductPanel = 'seller' | 'organizer' | 'admin';

export interface ProductViewMode {
  /** Tools of the active role, or null when the viewer has none for this item. */
  panel: ProductPanel | null;
  /** Buyer interactions: price offers, questions, reporting. */
  buyerActions: boolean;
  /**
   * Views of this item the viewer can switch between: always the participant view
   * (buyer, or seller of own items), plus organizer and administrator where the viewer
   * has tools for the item. The switch only shows with two or more.
   */
  roles: UserRole[];
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
  const roles: UserRole[] = [
    'participant',
    ...(isOrganizer ? (['organizer'] as const) : []),
    ...(isAdmin ? (['administrator'] as const) : []),
  ];

  return { panel, buyerActions: panel === null && !isOwner, roles };
}

/** Same names as the role switcher in the sidebar. */
export const ROLE_VIEW_LABEL: Record<UserRole, string> = {
  participant: 'Teilnehmer',
  organizer: 'Veranstalter',
  administrator: 'Admin',
};
