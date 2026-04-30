/**
 * Possible user account statuses in the system.
 */
export const USER_STATUSES = ['notVerified', 'active', 'inactive', 'deleted', 'banned'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * System-level user roles. Admin must always be at index 0.
 */
export const SYSTEM_ROLES = ['admin', 'user'] as const; // leave admin always on position SYSTEM_ROLES[0]!!
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/**
 * Product condition states for marketplace items.
 */
export const PRODUCT_CONDITIONS = ['new', 'very-good', 'good', 'ok'] as const;
export type ProductContitions = (typeof PRODUCT_CONDITIONS)[number];

/**
 * Status progression for products in events/fairs.
 */
export const EVENT_PRODUCT_STATUSES = ['announced', 'available', 'sold', 'returned'] as const;
export type EventProductStatus = (typeof EVENT_PRODUCT_STATUSES)[number];

/**
 * User roles within event organization.
 */
export const EVENT_ROLES = ['organizer', 'coorganizer', 'seller'] as const;
export type EventRoles = (typeof EVENT_ROLES)[number];

/**
 * Event visibility levels controlling who can access events.
 */
export const EVENT_VISIBILITY = ['public', 'logged-in', 'approved'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITY)[number];

/**
 * Available services that can be offered at events.
 */
export const EVENT_SERVICES = [
  'Parkplatz',
  'Skiservice',
  'Gastronomie',
  'Imbiss',
  'Getränke',
] as const;
export type EventServices = (typeof EVENT_SERVICES)[number];
