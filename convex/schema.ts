import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  EVENT_PRODUCT_STATUSES,
  EVENT_ROLES,
  EVENT_SERVICES,
  EVENT_VISIBILITY,
  LABEL_FORMATS,
  MODERATION_ACTIONS,
  NOTICE_AREAS,
  OFFER_CLOSE_REASONS,
  OFFER_STATUSES,
  PRODUCT_CONDITIONS,
  PURCHASE_PRICE_SOURCES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGETS,
  SITE_PAGE_SLUGS,
  SYSTEM_ROLES,
  USER_STATUSES,
} from './constants';

/** Set when an administrator hides content; the owner still sees it, with the reason. */
export const moderationValidator = v.object({
  hiddenAt: v.number(),
  hiddenBy: v.id('users'),
  reason: v.string(),
});

export const eventFeaturesValidator = v.object({
  discounts: v.optional(v.boolean()),
  discountStartsAt: v.optional(v.number()),
  maxDiscountPercent: v.optional(v.number()),
  priceOffers: v.optional(v.boolean()),
  minimumPrice: v.optional(v.boolean()),
  questions: v.optional(v.boolean()),
  photosOptional: v.optional(v.boolean()),
  maxItemsPerSeller: v.optional(v.number()),
  labelFormat: v.optional(v.union(...LABEL_FORMATS.map(v.literal))),
  priceOnLabel: v.optional(v.boolean()),
  intakeFee: v.optional(v.number()),
});

export default defineSchema({
  ...authTables,
  users: defineTable({
    // Convex Default databse
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // Additional custom Fields
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    street: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    country: v.optional(v.string()),
    verificationToken: v.optional(v.string()),
    isMailConfirmed: v.optional(v.boolean()),
    status: v.optional(v.union(...USER_STATUSES.map(v.literal))),
    lastLoginAt: v.optional(v.number()),
    systemRole: v.optional(v.union(...SYSTEM_ROLES.map(v.literal))),

    // Onboarding
    needsOnboarding: v.optional(v.boolean()),

    // Check-in / QR-Code Identification
    checkInToken: v.optional(v.string()),
    checkInTokenExpires: v.optional(v.number()),

    // Walk-in sellers: accounts an organizer creates on site for people without login.
    // They cannot sign in; contactEmail is only used for notifications.
    managedByEventId: v.optional(v.id('events')),
    contactEmail: v.optional(v.string()),
  })
    .index('by_email', ['email'])
    .index('by_checkInToken', ['checkInToken'])
    .index('by_systemRole', ['systemRole'])
    .index('by_status', ['status']),

  /** Totals for the admin overview, counted hourly in batches instead of on every view */
  platformStats: defineTable({
    users: v.number(),
    products: v.number(),
    updatedAt: v.number(),
  }),

  products: defineTable({
    title: v.string(),
    vendorId: v.id('users'),
    description: v.string(),
    condition: v.union(...PRODUCT_CONDITIONS.map(v.literal)),
    images: v.array(v.id('_storage')),
    productCategory: v.id('categories'),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
    price: v.number(),
    readyForSale: v.boolean(),
    sold: v.boolean(),
    // Category specific extra fields, see categoryFields.ts
    attributes: v.optional(v.record(v.string(), v.string())),
    // Seller accepts online price offers (only used in events with priceOffers)
    acceptsOffers: v.optional(v.boolean()),
    // Lowest price the cash desk may sell for (only used in events with minimumPrice).
    // Never sent to buyers.
    minimumPrice: v.optional(v.number()),
    moderation: v.optional(moderationValidator),
  })
    .index('by_vendorId', ['vendorId'])
    .index('by_hiddenAt', ['moderation.hiddenAt']),

  events: defineTable({
    title: v.string(),
    description: v.string(),
    coverImage: v.optional(v.id('_storage')),
    eventMapImage: v.optional(v.id('_storage')),
    location: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    contactInfo: v.string(),
    categories: v.array(v.id('categories')),
    services: v.array(v.union(...EVENT_SERVICES.map(v.literal))),
    visibility: v.union(...EVENT_VISIBILITY.map(v.literal)),
    isApproved: v.optional(v.boolean()),
    approvalStatus: v.optional(
      v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected'))
    ),
    approvedAt: v.optional(v.number()),
    approvedBy: v.optional(v.id('users')),
    rejectedAt: v.optional(v.number()),
    rejectedBy: v.optional(v.id('users')),
    rejectionReason: v.optional(v.string()),
    accessCode: v.optional(v.string()),
    vendorLimit: v.optional(v.number()),
    /** Highest seller number given out, so numbers of sellers who left are not reused */
    lastSellerNumber: v.optional(v.number()),
    commission: v.number(),
    /** Unused (see features.intakeFee); kept for existing documents */
    saleFeeFixed: v.optional(v.number()),
    saleFeePercentage: v.optional(v.number()),
    features: v.optional(eventFeaturesValidator),
    moderation: v.optional(moderationValidator),

    organizerId: v.id('users'),
  })
    .index('by_organizerId', ['organizerId'])
    .index('by_approvalStatus', ['approvalStatus'])
    .index('by_endDate', ['endDate'])
    .index('by_hiddenAt', ['moderation.hiddenAt']),

  eventProducts: defineTable({
    eventId: v.id('events'),
    productId: v.id('products'),
    status: v.union(...EVENT_PRODUCT_STATUSES.map(v.literal)),
    discountPercent: v.optional(v.number()),
    locationCategoryId: v.optional(v.id('eventLocationCategories')),
    // Only visible to organizers, e.g. the hook number on the key board
    internalNote: v.optional(v.string()),
  })
    .index('by_eventId', ['eventId'])
    .index('by_productId', ['productId'])
    .index('by_eventId_productId', ['eventId', 'productId']),

  eventLocationCategories: defineTable({
    eventId: v.id('events'),
    label: v.string(),
  }).index('by_eventId', ['eventId']),

  categories: defineTable({
    label: v.string(),
    parentCategory: v.optional(v.id('categories')),
    updatedAt: v.number(),
  }).index('by_label', ['label']),

  eventSeller: defineTable({
    event: v.id('events'),
    user: v.id('users'),
    totalFee: v.number(),
    comissionFee: v.number(),
    /** Unused; kept for existing documents */
    saleFeeFixed: v.optional(v.number()),
    saleFeePercentage: v.optional(v.number()),
    numberpayoutAmount: v.number(),
    payoutReceived: v.boolean(),
    /** Short seller number of this event (1, 2, …) for labels, sorting and pay-out */
    number: v.optional(v.number()),
    /** Intake fee kept at payout (total in €) and for how many items; set when paid out */
    intakeFee: v.optional(v.number()),
    intakeFeeItems: v.optional(v.number()),
  }).index('by_event_user', ['event', 'user']),

  purchase: defineTable({
    product: v.id('products'),
    event: v.id('events'),
    seller: v.id('users'),
    totalAmount: v.number(),
    comissionAmount: v.number(),
    payoutAmount: v.number(),
    payoutStatus: v.boolean(),
    payoutDate: v.number(),
    discountPercent: v.optional(v.number()),
    // Product price before discount/offer/negotiation; older rows only have discountPercent
    listPrice: v.optional(v.number()),
    priceSource: v.optional(v.union(...PURCHASE_PRICE_SOURCES.map(v.literal))),
    offerId: v.optional(v.id('productOffers')),
  })
    .index('by_event_seller', ['event', 'seller'])
    .index('by_seller', ['seller'])
    .index('by_product', ['product']),

  productOffers: defineTable({
    eventId: v.id('events'),
    productId: v.id('products'),
    eventProductId: v.id('eventProducts'),
    buyerId: v.id('users'),
    amount: v.number(),
    message: v.optional(v.string()),
    status: v.union(...OFFER_STATUSES.map(v.literal)),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
    /** Set when the offer was closed by a sale, return or removal, not by the seller */
    closedBy: v.optional(v.union(...OFFER_CLOSE_REASONS.map(v.literal))),
    /** Status before that closing, restored when the sale or return is undone */
    closedFromStatus: v.optional(v.union(v.literal('pending'), v.literal('accepted'))),
  })
    .index('by_eventProduct', ['eventProductId'])
    .index('by_product', ['productId'])
    .index('by_buyer', ['buyerId'])
    .index('by_status', ['status']),

  productQuestions: defineTable({
    eventId: v.id('events'),
    productId: v.id('products'),
    askerId: v.id('users'),
    question: v.string(),
    answer: v.optional(v.string()),
    answeredBy: v.optional(v.id('users')),
    createdAt: v.number(),
    answeredAt: v.optional(v.number()),
  })
    .index('by_product', ['productId'])
    .index('by_asker', ['askerId']),

  /** Red markers in the menu: one per notification the user has not looked at yet. */
  unreadNotices: defineTable({
    userId: v.id('users'),
    area: v.union(...NOTICE_AREAS.map(v.literal)),
    createdAt: v.number(),
  }).index('by_user_area', ['userId', 'area']),

  eventRole: defineTable({
    event: v.id('events'),
    user: v.id('users'),
    roles: v.union(...EVENT_ROLES.map(v.literal)),
  })
    .index('by_event_user_role', ['event', 'user', 'roles'])
    .index('by_event_role', ['event', 'roles'])
    .index('by_user_role', ['user', 'roles']),

  featureFlags: defineTable({
    key: v.string(),
    value: v.boolean(),
    description: v.optional(v.string()),
  }).index('by_key', ['key']),

  e2eAuthTokens: defineTable({
    email: v.string(),
    code: v.string(),
    createdAt: v.number(),
  }).index('by_email', ['email']),

  messages: defineTable({
    name: v.string(),
    email: v.string(),
    message: v.string(),
    acceptedPrivacyPolicy: v.boolean(),
    createdAt: v.number(),
    handledAt: v.optional(v.number()),
    handledBy: v.optional(v.id('users')),
  }).index('by_handledAt', ['handledAt']),

  reports: defineTable({
    targetType: v.union(...REPORT_TARGETS.map(v.literal)),
    targetId: v.string(),
    reason: v.union(...REPORT_REASONS.map(v.literal)),
    details: v.string(),
    reporterId: v.optional(v.id('users')),
    reporterEmail: v.optional(v.string()),
    status: v.union(...REPORT_STATUSES.map(v.literal)),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id('users')),
    resolutionNote: v.optional(v.string()),
  })
    .index('by_status', ['status'])
    .index('by_target', ['targetType', 'targetId'])
    .index('by_createdAt', ['createdAt']),

  /** Legal pages maintained by admins; the latest text per slug. */
  sitePages: defineTable({
    slug: v.union(...SITE_PAGE_SLUGS.map(v.literal)),
    title: v.string(),
    markdown: v.string(),
    version: v.number(),
    updatedAt: v.number(),
    updatedBy: v.id('users'),
  }).index('by_slug', ['slug']),

  /** Every saved version of a legal page, e.g. to know which terms a user accepted. */
  sitePageVersions: defineTable({
    slug: v.union(...SITE_PAGE_SLUGS.map(v.literal)),
    version: v.number(),
    title: v.string(),
    markdown: v.string(),
    createdAt: v.number(),
    createdBy: v.id('users'),
  }).index('by_slug_version', ['slug', 'version']),

  /** Settings of this instance that admins change in the dashboard; at most one row. */
  siteSettings: defineTable({
    name: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    logo: v.optional(v.id('_storage')),
    /** Web analytics; unset values fall back to PLAUSIBLE_* of the web server */
    plausibleEnabled: v.optional(v.boolean()),
    plausibleDomain: v.optional(v.string()),
    plausibleApiHost: v.optional(v.string()),
    /** Self-hosted start page: overview of all bazaars (default) or straight to the current one */
    startPage: v.optional(v.union(v.literal('overview'), v.literal('currentEvent'))),
    updatedAt: v.number(),
    updatedBy: v.id('users'),
  }),

  moderationLog: defineTable({
    adminId: v.id('users'),
    action: v.union(...MODERATION_ACTIONS.map(v.literal)),
    targetType: v.union(...REPORT_TARGETS.map(v.literal)),
    targetId: v.string(),
    targetLabel: v.string(),
    reason: v.optional(v.string()),
    reportId: v.optional(v.id('reports')),
    createdAt: v.number(),
  }).index('by_target', ['targetType', 'targetId']),
});
