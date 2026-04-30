import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  EVENT_PRODUCT_STATUSES,
  EVENT_ROLES,
  EVENT_SERVICES,
  EVENT_VISIBILITY,
  PRODUCT_CONDITIONS,
  SYSTEM_ROLES,
  USER_STATUSES,
} from './constants';

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
  })
    .index('by_email', ['email'])
    .index('by_checkInToken', ['checkInToken']),

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
  }).index('by_vendorId', ['vendorId']),

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
    commission: v.number(),
    saleFeeFixed: v.optional(v.number()),
    saleFeePercentage: v.optional(v.number()),

    organizerId: v.id('users'),
  }).index('by_organizerId', ['organizerId']),

  eventProducts: defineTable({
    eventId: v.id('events'),
    productId: v.id('products'),
    status: v.union(...EVENT_PRODUCT_STATUSES.map(v.literal)),
    discountPercent: v.optional(v.number()),
    locationCategoryId: v.optional(v.id('eventLocationCategories')),
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
    saleFeeFixed: v.optional(v.number()),
    saleFeePercentage: v.optional(v.number()),
    numberpayoutAmount: v.number(),
    payoutReceived: v.boolean(),
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
  }).index('by_event_seller', ['event', 'seller']),

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
  }),
});
