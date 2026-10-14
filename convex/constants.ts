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

/**
 * Lifecycle of an online price offer. `redeemed`: the accepted offer was used at the
 * cash desk and the item sold at its price.
 */
export const OFFER_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn', 'redeemed'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/**
 * Why an offer was closed without the seller rejecting it. Sales and returns can be
 * undone at the cash desk, and the offers they closed come back with them.
 * `expired`: the event ended while the offer was still open or not yet redeemed.
 */
export const OFFER_CLOSE_REASONS = ['sale', 'return', 'removed', 'expired'] as const;
export type OfferCloseReason = (typeof OFFER_CLOSE_REASONS)[number];

/**
 * Menu entries that show a red marker for unread notifications: "Meine Produkte",
 * "Meine Verkäufe" and, for organizers, "Meine Events".
 */
export const NOTICE_AREAS = ['products', 'sales', 'events'] as const;
export type NoticeArea = (typeof NOTICE_AREAS)[number];

/**
 * How the price of a sale came about: list price (incl. discount), an accepted
 * online offer, or negotiated at the cash desk down to the seller's minimum price.
 */
export const PURCHASE_PRICE_SOURCES = ['list', 'offer', 'negotiated'] as const;
export type PurchasePriceSource = (typeof PURCHASE_PRICE_SOURCES)[number];

/**
 * Content anyone can report to the platform administrators (notice and action, Art. 16 DSA).
 */
export const REPORT_TARGETS = ['product', 'event', 'question', 'user'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = [
  'illegal',
  'fraud',
  'offensive',
  'personalData',
  'spam',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Administrator actions recorded in the moderation log.
 */
export const MODERATION_ACTIONS = [
  'hideProduct',
  'restoreProduct',
  'hideEvent',
  'restoreEvent',
  'deleteQuestion',
  'banUser',
  'unbanUser',
  'approveEvent',
  'rejectEvent',
  'resolveReport',
  'dismissReport',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** Address check shared by backend and frontend (contact form, receipts, reports). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
