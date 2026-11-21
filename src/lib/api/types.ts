/**
 * Types of the backend functions and documents, the contract between app and backend
 * (backend/src/modules). Generated once from the former Convex definitions; keep it in
 * step with the Rust structs when a function changes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { CategoryField, DescribedAttribute } from '../../shared/categoryFields';
import type { FeeGroup } from '../../shared/feeGroups';
import type { EventProductStatus, EventServices, HelperPermission } from '../../shared/constants';

export type TableName =
  | '_storage'
  | 'categories'
  | 'contactMessages'
  | 'eventBroadcasts'
  | 'eventLocationCategories'
  | 'eventProducts'
  | 'eventRole'
  | 'eventSeller'
  | 'eventInvitations'
  | 'events'
  | 'featureFlags'
  | 'messages'
  | 'moderationLog'
  | 'productOffers'
  | 'productQuestions'
  | 'products'
  | 'purchase'
  | 'reports'
  | 'sitePages'
  | 'users';

/** ID of a document; at runtime a string (UUID). */
export type Id<T extends TableName> = string & { __tableName: T };

export type Doc<T extends keyof Docs> = Docs[T];

/** Names of a category in other languages; `label` counts where one is missing. */
export type CategoryTranslations = { en?: string | undefined };

export interface Docs {
  users: {
    _id: Id<'users'>;
    _creationTime: number;
    name?: string | undefined;
    image?: string | undefined;
    email?: string | undefined;
    emailVerificationTime?: number | undefined;
    phone?: string | undefined;
    phoneVerificationTime?: number | undefined;
    isAnonymous?: boolean | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    street?: string | undefined;
    city?: string | undefined;
    zipCode?: string | undefined;
    country?: string | undefined;
    verificationToken?: string | undefined;
    isMailConfirmed?: boolean | undefined;
    status?: 'notVerified' | 'active' | 'inactive' | 'deleted' | 'banned' | undefined;
    lastLoginAt?: number | undefined;
    systemRole?: 'admin' | 'user' | undefined;
    needsOnboarding?: boolean | undefined;
    checkInToken?: string | undefined;
    checkInTokenExpires?: number | undefined;
    managedByEventId?: Id<'events'> | undefined;
    contactEmail?: string | undefined;
    notificationPrefs?:
      | {
          offers?: boolean | undefined;
          reminders?: boolean | undefined;
          sales?: boolean | undefined;
          questions?: boolean | undefined;
          buyer?: boolean | undefined;
          organizer?: boolean | undefined;
        }
      | undefined;
    unsubscribeToken?: string | undefined;
    locale?: 'de' | 'en' | undefined;
  };
  events: {
    _id: Id<'events'>;
    _creationTime: number;
    moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
    coverImage?: Id<'_storage'> | undefined;
    eventMapImage?: Id<'_storage'> | undefined;
    /** Picture of the region of a bazaar for its region (#304), made by the app */
    regionMapImage?: Id<'_storage'> | undefined;
    isApproved?: boolean | undefined;
    approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
    approvedAt?: number | undefined;
    approvedBy?: Id<'users'> | undefined;
    rejectedAt?: number | undefined;
    rejectedBy?: Id<'users'> | undefined;
    rejectionReason?: string | undefined;
    accessCode?: string | undefined;
    vendorLimit?: number | undefined;
    /** Places taken by sellers, only with a vendorLimit */
    sellerCount?: number | undefined;
    lastSellerNumber?: number | undefined;
    saleFeeFixed?: number | undefined;
    saleFeePercentage?: number | undefined;
    features?:
      | {
          questions?: boolean | undefined;
          minimumPrice?: boolean | undefined;
          discounts?: boolean | undefined;
          discountStartsAt?: number | undefined;
          maxDiscountPercent?: number | undefined;
          priceOffers?: boolean | undefined;
          questionsDuringEventOnly?: boolean | undefined;
          photosOptional?: boolean | undefined;
          publicCatalog?: boolean | undefined;
          requiredFields?: string[] | undefined;
          maxItemsPerSeller?: number | undefined;
          maxItemsTotal?: number | undefined;
          labelFormat?: 'small' | 'standard' | undefined;
          priceOnLabel?: boolean | undefined;
          labelMark?: 'universal' | 'none' | undefined;
          intakeFee?: number | undefined;
          maxFeesPerSeller?: number | undefined;
          feeGroups?: FeeGroup[] | undefined;
          privateSellersOnly?: boolean | undefined;
          fixedSellerData?: boolean | undefined;
          directSale?: boolean | undefined;
          autoReturn?: boolean | undefined;
          registrationOpen?: boolean | undefined;
          registrationStartsAt?: number | undefined;
          registrationEndsAt?: number | undefined;
        }
      | undefined;
    sellerLogistics?:
      | {
          dropoffStart?: number | undefined;
          dropoffEnd?: number | undefined;
          pickupStart?: number | undefined;
          pickupEnd?: number | undefined;
          note?: string | undefined;
        }
      | undefined;
    remindersSent?: { dayBefore?: number | undefined; pickup?: number | undefined } | undefined;
    /** The nightly cron returned the items left over after the bazaar (#305) */
    leftoversReturnedAt?: number | undefined;
    categories: Id<'categories'>[];
    title: string;
    description: string;
    location: string;
    /** Address of the venue; `location` is its name or, in older events, all of it */
    street?: string | undefined;
    postalCode?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    startDate: number;
    endDate: number;
    contactInfo: string;
    services: EventServices[];
    visibility: 'public' | 'logged-in' | 'approved';
    commission: number;
    organizerId: Id<'users'>;
  };
  products: {
    _id: Id<'products'>;
    _creationTime: number;
    moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
    attributes?: Record<string, string> | undefined;
    acceptsOffers?: boolean | undefined;
    minimumPrice?: number | undefined;
    updatedAt: number;
    title: string;
    vendorId: Id<'users'>;
    description: string;
    condition: 'new' | 'very-good' | 'good' | 'ok';
    images: Id<'_storage'>[];
    productCategory: Id<'categories'>;
    price: number;
    readyForSale: boolean;
    sold: boolean;
  };
  eventProducts: {
    _id: Id<'eventProducts'>;
    _creationTime: number;
    discountPercent?: number | undefined;
    locationCategoryId?: Id<'eventLocationCategories'> | undefined;
    internalNote?: string | undefined;
    /** Returned by the nightly cron after the bazaar, not by a person (#305) */
    autoReturnedAt?: number | undefined;
    status: EventProductStatus;
    eventId: Id<'events'>;
    productId: Id<'products'>;
  };
  categories: {
    translations: CategoryTranslations;
    _id: Id<'categories'>;
    _creationTime: number;
    parentCategory?: Id<'categories'> | undefined;
    updatedAt: number;
    label: string;
    /** Ids of the extra fields an admin picked; unset: those of the main category */
    fields?: string[] | undefined;
    /** The extra fields its items have, from its own choice or its main category */
    fieldList: CategoryField[];
  };
  eventLocationCategories: {
    _id: Id<'eventLocationCategories'>;
    _creationTime: number;
    eventId: Id<'events'>;
    label: string;
  };
  productOffers: {
    _id: Id<'productOffers'>;
    _creationTime: number;
    message?: string | undefined;
    respondedAt?: number | undefined;
    closedBy?: 'sale' | 'return' | 'removed' | 'expired' | undefined;
    closedFromStatus?: 'pending' | 'accepted' | undefined;
    status: 'pending' | 'rejected' | 'accepted' | 'withdrawn' | 'redeemed';
    eventId: Id<'events'>;
    productId: Id<'products'>;
    createdAt: number;
    eventProductId: Id<'eventProducts'>;
    buyerId: Id<'users'>;
    amount: number;
  };
  reports: {
    _id: Id<'reports'>;
    _creationTime: number;
    reporterId?: Id<'users'> | undefined;
    reporterEmail?: string | undefined;
    resolvedAt?: number | undefined;
    resolvedBy?: Id<'users'> | undefined;
    resolutionNote?: string | undefined;
    status: 'open' | 'resolved' | 'dismissed';
    reason: 'illegal' | 'fraud' | 'offensive' | 'personalData' | 'spam' | 'other';
    createdAt: number;
    targetType: 'user' | 'event' | 'product' | 'question';
    targetId: string;
    details: string;
  };
  productQuestions: {
    _id: Id<'productQuestions'>;
    _creationTime: number;
    answer?: string | undefined;
    answeredBy?: Id<'users'> | undefined;
    answeredAt?: number | undefined;
    eventId: Id<'events'>;
    productId: Id<'products'>;
    createdAt: number;
    askerId: Id<'users'>;
    question: string;
  };
  purchase: {
    _id: Id<'purchase'>;
    _creationTime: number;
    discountPercent?: number | undefined;
    listPrice?: number | undefined;
    priceSource?: 'list' | 'offer' | 'negotiated' | undefined;
    offerId?: Id<'productOffers'> | undefined;
    event: Id<'events'>;
    product: Id<'products'>;
    seller: Id<'users'>;
    totalAmount: number;
    comissionAmount: number;
    payoutAmount: number;
    payoutStatus: boolean;
    payoutDate: number;
    /** Paid to the seller at the item; the desk took only the commission */
    directSale: boolean;
  };
  eventSeller: {
    _id: Id<'eventSeller'>;
    _creationTime: number;
    number?: number | undefined;
    saleFeeFixed?: number | undefined;
    saleFeePercentage?: number | undefined;
    intakeFee?: number | undefined;
    intakeFeeItems?: number | undefined;
    privateSellerConfirmedAt?: number | undefined;
    sellerSnapshot?:
      | {
          email?: string | undefined;
          phone?: string | undefined;
          firstName?: string | undefined;
          lastName?: string | undefined;
          street?: string | undefined;
          city?: string | undefined;
          zipCode?: string | undefined;
          country?: string | undefined;
          takenAt: number;
        }
      | undefined;
    user: Id<'users'>;
    event: Id<'events'>;
    totalFee: number;
    comissionFee: number;
    numberpayoutAmount: number;
    payoutReceived: boolean;
  };
  eventRole: {
    _id: Id<'eventRole'>;
    _creationTime: number;
    user: Id<'users'>;
    event: Id<'events'>;
    roles: 'organizer' | 'seller' | 'coorganizer';
  };
  eventBroadcasts: {
    _id: Id<'eventBroadcasts'>;
    _creationTime: number;
    eventId: Id<'events'>;
    senderId: Id<'users'>;
    subject: string;
    body: string;
    audience: 'pickup' | 'all' | 'accepted' | 'withoutItems';
    important: boolean;
    recipientIds: Id<'users'>[];
    createdAt: number;
  };
  moderationLog: {
    _id: Id<'moderationLog'>;
    _creationTime: number;
    reason?: string | undefined;
    reportId?: Id<'reports'> | undefined;
    createdAt: number;
    targetType: 'user' | 'event' | 'product' | 'question';
    targetId: string;
    adminId: Id<'users'>;
    action:
      | 'hideProduct'
      | 'restoreProduct'
      | 'hideEvent'
      | 'restoreEvent'
      | 'deleteQuestion'
      | 'banUser'
      | 'unbanUser'
      | 'approveEvent'
      | 'rejectEvent'
      | 'resolveReport'
      | 'dismissReport';
    targetLabel: string;
  };
  sitePages: {
    _id: Id<'sitePages'>;
    _creationTime: number;
    updatedAt: number;
    title: string;
    slug: 'imprint' | 'privacy' | 'terms';
    markdown: string;
    version: number;
    updatedBy: Id<'users'>;
  };
  featureFlags: {
    _id: Id<'featureFlags'>;
    _creationTime: number;
    description?: string | undefined;
    key: string;
    value: boolean;
  };
}

export type BroadcastView = {
  audience?: 'pickup' | 'all' | 'accepted' | 'withoutItems' | undefined;
  recipientCount?: number | undefined;
  subject: string;
  body: string;
  important: boolean;
  createdAt: number;
  _id: Id<'eventBroadcasts'>;
};

/** An extra field of item categories, as admins define it */
export type CategoryFieldDefinition = CategoryField;

/** A value of an item with the name of its field (in German and maybe English) */
export type CategoryAttribute = DescribedAttribute;

export type DiscountRules = {
  allowed: boolean;
  reason?: string | undefined;
  maxDiscountPercent: number;
  discountStartsAt?: number | undefined;
};

export type EmptyObject = { [x: string]: never };

export type EventFeatures = {
  discounts: boolean;
  discountStartsAt?: number | undefined;
  maxDiscountPercent: number;
  priceOffers: boolean;
  minimumPrice: boolean;
  questions: boolean;
  questionsDuringEventOnly: boolean;
  photosOptional: boolean;
  publicCatalog: boolean;
  requiredFields?: string[] | undefined;
  maxItemsPerSeller?: number | undefined;
  maxItemsTotal?: number | undefined;
  labelFormat: 'small' | 'standard';
  priceOnLabel: boolean;
  labelMark: 'universal' | 'none';
  intakeFee?: number | undefined;
  maxFeesPerSeller?: number | undefined;
  feeGroups?: FeeGroup[] | undefined;
  privateSellersOnly: boolean;
  fixedSellerData: boolean;
  directSale: boolean;
  registrationOpen?: boolean | undefined;
  registrationStartsAt?: number | undefined;
  registrationEndsAt?: number | undefined;
};

export type IntakeFee = { perItem: number; items: number; total: number };

export type ProductWithEvents = {
  _id: Id<'products'>;
  _creationTime: number;
  moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
  attributes?: Record<string, string> | undefined;
  acceptsOffers?: boolean | undefined;
  minimumPrice?: number | undefined;
  updatedAt: number;
  title: string;
  vendorId: Id<'users'>;
  description: string;
  condition: 'new' | 'very-good' | 'good' | 'ok';
  images: Id<'_storage'>[];
  productCategory: Id<'categories'>;
  price: number;
  readyForSale: boolean;
  sold: boolean;
} & {
  eventIds: string[];
  discountPercent?: number | undefined;
  discountRules?: DiscountRules | undefined;
  pendingOfferCount?: number | undefined;
  unansweredQuestionCount?: number | undefined;
  isLocked: boolean;
  canDelete?: boolean | undefined;
  eventStatus?: string | undefined;
  isAvailable?: boolean | undefined;
  sale?: SaleInfo | undefined;
};

export type ProofItem = {
  /** Missing for a sold item whose product was deleted */
  productId?: Id<'products'> | undefined;
  title: string;
  category: string;
  attributes: CategoryAttribute[];
  price: number;
  status: string;
  soldFor?: number | undefined;
  soldAt?: number | undefined;
  seller: ProofSeller;
};

export type ProofSeller = {
  sellerNumber?: number | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  street?: string | undefined;
  zipCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  privateSellerConfirmedAt?: number | undefined;
  fromRecord: boolean;
};

/** The settlement of a bazaar for the organizers' records (§ 147 AO) */
export type SettlementExport = {
  event: {
    title: string;
    location: string;
    startDate: number;
    endDate: number;
    commission: number;
    /** Fee cap per seller; with it the seller table has its column */
    maxFeesPerSeller?: number | undefined;
    /** The bazaar has fee groups; with it the seller table has a column for them */
    feeGroups?: boolean | undefined;
  };
  sales: SettlementSale[];
  sellers: SettlementSeller[];
};

export type SettlementSale = {
  soldAt: number;
  title: string;
  category: string;
  sellerNumber?: number | undefined;
  listPrice: number;
  totalAmount: number;
  priceSource: SaleInfo['priceSource'];
  commission: number;
  payout: number;
  /** Paid to the seller at the item; the desk took only the commission */
  directSale: boolean;
};

export type SettlementSeller = {
  sellerNumber?: number | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  street?: string | undefined;
  zipCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  revenue: number;
  commission: number;
  intakeFee: number;
  /** Fees above the cap given back; missing from older backends */
  feeCapCredit?: number;
  /** Negative when the seller owes the bazaar */
  payout: number;
  paid: boolean;
  /** The fee group applied (#302) */
  feeGroup?: string | undefined;
};

export type SaleInfo = {
  listPrice: number;
  discountPercent?: number | undefined;
  priceSource: 'list' | 'offer' | 'negotiated';
  totalAmount: number;
  commission: number;
  /** What the seller gets from the bazaar; 0 at a direct sale */
  payout: number;
  /** The buyer paid the seller at the item; the seller paid the commission at the desk */
  directSale: boolean;
  soldAt: number;
};

export type TargetInfo = {
  label: string;
  path?: string | undefined;
  ownerId?: Id<'users'> | undefined;
  ownerName?: string | undefined;
  isRestricted: boolean;
  exists: boolean;
};

export type UnreadMessages = { count: number; since: number };

export type VendorWithCalculations = {
  _id: Id<'users'>;
  _creationTime: number;
  name?: string | undefined;
  image?: string | undefined;
  email?: string | undefined;
  emailVerificationTime?: number | undefined;
  phone?: string | undefined;
  phoneVerificationTime?: number | undefined;
  isAnonymous?: boolean | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  street?: string | undefined;
  city?: string | undefined;
  zipCode?: string | undefined;
  country?: string | undefined;
  verificationToken?: string | undefined;
  isMailConfirmed?: boolean | undefined;
  status?: 'notVerified' | 'active' | 'inactive' | 'deleted' | 'banned' | undefined;
  lastLoginAt?: number | undefined;
  systemRole?: 'admin' | 'user' | undefined;
  needsOnboarding?: boolean | undefined;
  checkInToken?: string | undefined;
  checkInTokenExpires?: number | undefined;
  managedByEventId?: Id<'events'> | undefined;
  contactEmail?: string | undefined;
  notificationPrefs?:
    | {
        offers?: boolean | undefined;
        reminders?: boolean | undefined;
        sales?: boolean | undefined;
        questions?: boolean | undefined;
        buyer?: boolean | undefined;
        organizer?: boolean | undefined;
      }
    | undefined;
  unsubscribeToken?: string | undefined;
  locale?: 'de' | 'en' | undefined;
} & {
  totalRevenue: number;
  commission: number;
  intakeFee: IntakeFee;
  /** Fees above the cap (maxFeesPerSeller) the seller gets back */
  feeCapCredit: number;
  /** Sales less commission and intake fee, plus feeCapCredit */
  payout: number;
  /** Direct sales: what the seller got from the buyers and keeps; not in the payout */
  receivedDirectly: number;
  paid: boolean;
  grossRevenue: number;
  totalDiscount: number;
  isHelper: boolean;
  /** What the helper may do; only for helpers */
  helperPermissions?: HelperPermission[] | undefined;
  sellerNumber?: number | undefined;
  /** The seller's lasting code, on bazaars with universal labels */
  sortCode?: number | undefined;
  /** Bazaars with fixedSellerData: name and address are recorded (first item accepted) */
  detailsRecorded?: boolean | undefined;
  /** The organizer took the seller out of the bazaar */
  excluded?: Exclusion | undefined;
  /** The fee group whose fees apply (#302) */
  feeGroup?: VendorFeeGroup | undefined;
  /** The seller's commission in percent: their group's or the bazaar's; once paid out the one settled with */
  commissionPercent: number;
  /** Has not announced any item yet (#304); not for the team, walk-in or excluded sellers */
  withoutItems?: boolean | undefined;
};

/** A seller's fee group as the team sees it (#302) */
export type VendorFeeGroup = {
  /** Missing once paid out: then the group as settled */
  id?: string | undefined;
  label: string;
  /** Self-declared and not checked yet: the intake confirms or takes it away first */
  pending: boolean;
  /** By the helper role, not chosen or put in */
  byRole: boolean;
  /** The group the seller chose or was put in, when another one applies */
  chosen?: string | undefined;
};

/** The signed-in seller's fee group at a bazaar (#302) */
export type MyFeeGroup = {
  chosen?: string | undefined;
  /** The group whose fees apply */
  applied?: string | undefined;
  /** Still to be checked at the intake */
  pending: boolean;
  decidedAt?: number | undefined;
  /** The seller can no longer change it */
  locked: boolean;
};

/** The organizer took a seller out of the bazaar (#252) */
export type Exclusion = { excludedAt: number; reason?: string | undefined };

/** The seller's own item the team turned down at a bazaar: not handed in on time */
export type MyRejection = {
  productId: Id<'products'>;
  title: string;
  image?: Id<'_storage'> | undefined;
  rejectedAt: number;
};

export interface FunctionReference<Kind extends 'query' | 'mutation', Args = any, Returns = any> {
  _type: Kind;
  _args: Args;
  _returnType: Returns;
}

export interface Api {
  auth: {
    isAuthenticated: FunctionReference<'query', EmptyObject, boolean>;
  };
  authProviders: {
    configured: FunctionReference<'query', EmptyObject, { google: boolean; github: boolean }>;
  };
  broadcasts: {
    getBroadcastPreview: FunctionReference<
      'query',
      { eventId: Id<'events'>; audience: 'pickup' | 'all' | 'accepted' | 'withoutItems' },
      { recipients: number; left: number; importantLeft: number }
    >;
    sendSellerBroadcast: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        subject: string;
        body: string;
        audience: 'pickup' | 'all' | 'accepted' | 'withoutItems';
        important: boolean;
      },
      number
    >;
    getMyUnreadMessages: FunctionReference<
      'query',
      EmptyObject,
      { [x: Id<'events'>]: UnreadMessages }
    >;
    listEventBroadcasts: FunctionReference<'query', { eventId: Id<'events'> }, BroadcastView[]>;
  };
  categories: {
    createCategory: FunctionReference<
      'mutation',
      {
        parentCategory?: Id<'categories'> | undefined;
        label: string;
        translations?: CategoryTranslations | undefined;
        fields?: string[] | undefined;
      },
      Id<'categories'>
    >;
    updateCategory: FunctionReference<
      'mutation',
      {
        categoryId: Id<'categories'>;
        label: string;
        translations: CategoryTranslations;
        /** Unset: a main category */
        parentCategory?: Id<'categories'> | undefined;
        /** Unset: those of the main category */
        fields?: string[] | undefined;
      },
      null
    >;
    deleteCategory: FunctionReference<'mutation', { categoryId: Id<'categories'> }, null>;
    listForAdmin: FunctionReference<
      'query',
      EmptyObject,
      (Doc<'categories'> & { productCount: number; eventCount: number; childCount: number })[]
    >;
    getAllCategories: FunctionReference<'query', EmptyObject, Doc<'categories'>[]>;
    listFields: FunctionReference<'query', EmptyObject, CategoryField[]>;
    listFieldsForAdmin: FunctionReference<
      'query',
      EmptyObject,
      (CategoryField & { categoryCount: number })[]
    >;
    saveField: FunctionReference<
      'mutation',
      {
        /** Unset: a new field */
        fieldId?: string | undefined;
        label: string;
        labelEn?: string | undefined;
        placeholder?: string | undefined;
        placeholderEn?: string | undefined;
        hint?: string | undefined;
        hintEn?: string | undefined;
        short: boolean;
      },
      string
    >;
    deleteField: FunctionReference<'mutation', { fieldId: string }, null>;
    getCategoryLabel: FunctionReference<'query', { categoryId: Id<'categories'> }, string | null>;
    getCategoryId: FunctionReference<'query', { categoryLabel: string }, Id<'categories'> | null>;
  };
  eventLocationCategories: {
    listForEvent: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      {
        _id: Id<'eventLocationCategories'>;
        _creationTime: number;
        eventId: Id<'events'>;
        label: string;
      }[]
    >;
    createCategory: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; label: string },
      Id<'eventLocationCategories'>
    >;
    updateCategoryLabel: FunctionReference<
      'mutation',
      { label: string; categoryId: Id<'eventLocationCategories'> },
      null
    >;
    deleteCategory: FunctionReference<
      'mutation',
      { categoryId: Id<'eventLocationCategories'> },
      null
    >;
  };
  eventProducts: {
    addProductToEvent: FunctionReference<
      'mutation',
      {
        status?: 'sold' | 'announced' | 'available' | 'returned' | undefined;
        eventId: Id<'events'>;
        productId: Id<'products'>;
      },
      Id<'eventProducts'>
    >;
    removeProductFromEvent: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        productId: Id<'products'>;
      },
      null
    >;
    setProductEvents: FunctionReference<
      'mutation',
      { productId: Id<'products'>; eventIds: Id<'events'>[] },
      Id<'eventProducts'>[]
    >;
    getEventIdsForProduct: FunctionReference<
      'query',
      { productId: Id<'products'> },
      Id<'events'>[]
    >;
    getEventLocationsForProduct: FunctionReference<
      'query',
      { productId: Id<'products'> },
      { eventId: Id<'events'>; locationLabel: string | undefined }[]
    >;
    getProductIdsForEvent: FunctionReference<'query', { eventId: Id<'events'> }, Id<'products'>[]>;
    getMyEventProductStatuses: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      {
        productId: Id<'products'>;
        status: EventProductStatus;
        discountPercent: number | undefined;
      }[]
    >;
    getFixedItemData: FunctionReference<
      'query',
      { productId: Id<'products'> },
      { fixed: boolean; fieldKeys: string[] }
    >;
    isProductLockedForSeller: FunctionReference<'query', { productId: Id<'products'> }, boolean>;
    getProductsForEvent: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      {
        eventProductId: Id<'eventProducts'>;
        status: EventProductStatus;
        discountPercent: number | undefined;
        locationCategoryId: Id<'eventLocationCategories'> | undefined;
        locationLabel: string | undefined;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        _creationTime: number;
        updatedAt: number;
        title: string;
        vendorId: Id<'users'>;
        description: string;
        condition: 'new' | 'very-good' | 'good' | 'ok';
        images: Id<'_storage'>[];
        productCategory: Id<'categories'>;
        price: number;
        readyForSale: boolean;
        sold: boolean;
        attributes?: Record<string, string> | undefined;
        acceptsOffers?: boolean | undefined;
        _id: Id<'products'>;
      }[]
    >;
    getProductsForEventManagement: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      {
        eventProductId: Id<'eventProducts'>;
        status: EventProductStatus;
        discountPercent: number | undefined;
        locationCategoryId: Id<'eventLocationCategories'> | undefined;
        locationLabel: string | undefined;
        internalNote: string | undefined;
        sale: SaleInfo | undefined;
        /** Returned by the nightly cron after the bazaar (#305) */
        autoReturnedAt?: number | undefined;
        _id: Id<'products'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        attributes?: Record<string, string> | undefined;
        acceptsOffers?: boolean | undefined;
        minimumPrice?: number | undefined;
        updatedAt: number;
        title: string;
        vendorId: Id<'users'>;
        description: string;
        condition: 'new' | 'very-good' | 'good' | 'ok';
        images: Id<'_storage'>[];
        productCategory: Id<'categories'>;
        price: number;
        readyForSale: boolean;
        sold: boolean;
      }[]
    >;
    getEventProduct: FunctionReference<
      'query',
      {
        eventId: Id<'events'>;
        productId: Id<'products'>;
      },
      {
        product: {
          _id: Id<'products'>;
          _creationTime: number;
          moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
          attributes?: Record<string, string> | undefined;
          acceptsOffers?: boolean | undefined;
          minimumPrice?: number | undefined;
          updatedAt: number;
          title: string;
          vendorId: Id<'users'>;
          description: string;
          condition: 'new' | 'very-good' | 'good' | 'ok';
          images: Id<'_storage'>[];
          productCategory: Id<'categories'>;
          price: number;
          readyForSale: boolean;
          sold: boolean;
        };
        vendor: {
          _id: Id<'users'>;
          _creationTime: number;
          name?: string | undefined;
          image?: string | undefined;
          email?: string | undefined;
          emailVerificationTime?: number | undefined;
          phone?: string | undefined;
          phoneVerificationTime?: number | undefined;
          isAnonymous?: boolean | undefined;
          firstName?: string | undefined;
          lastName?: string | undefined;
          street?: string | undefined;
          city?: string | undefined;
          zipCode?: string | undefined;
          country?: string | undefined;
          verificationToken?: string | undefined;
          isMailConfirmed?: boolean | undefined;
          status?: 'notVerified' | 'active' | 'inactive' | 'deleted' | 'banned' | undefined;
          lastLoginAt?: number | undefined;
          systemRole?: 'admin' | 'user' | undefined;
          needsOnboarding?: boolean | undefined;
          checkInToken?: string | undefined;
          checkInTokenExpires?: number | undefined;
          managedByEventId?: Id<'events'> | undefined;
          contactEmail?: string | undefined;
          notificationPrefs?:
            | {
                offers?: boolean | undefined;
                reminders?: boolean | undefined;
                sales?: boolean | undefined;
                questions?: boolean | undefined;
                buyer?: boolean | undefined;
                organizer?: boolean | undefined;
              }
            | undefined;
          unsubscribeToken?: string | undefined;
          locale?: 'de' | 'en' | undefined;
        } | null;
        locationLabel: string | undefined;
        _id: Id<'eventProducts'>;
        _creationTime: number;
        discountPercent?: number | undefined;
        locationCategoryId?: Id<'eventLocationCategories'> | undefined;
        internalNote?: string | undefined;
        status: EventProductStatus;
        eventId: Id<'events'>;
        productId: Id<'products'>;
      } | null
    >;
    setEventProductNote: FunctionReference<
      'mutation',
      {
        note: string;
        eventProductId: Id<'eventProducts'>;
        /** The note the team saw ("" for none); refused if someone changed it since */
        fromNote?: string | undefined;
      },
      null
    >;
    updateProductDiscount: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        productId: Id<'products'>;
        discountPercent: number;
      },
      null
    >;
    updateProductStatus: FunctionReference<
      'mutation',
      {
        locationCategoryId?: Id<'eventLocationCategories'> | undefined;
        status: EventProductStatus;
        eventProductId: Id<'eventProducts'>;
        /** The status the team saw; refused if the item has moved on since */
        fromStatus?: 'sold' | 'announced' | 'available' | 'returned' | undefined;
      },
      Id<'eventProducts'>
    >;
    setEventProductLocationCategory: FunctionReference<
      'mutation',
      {
        locationCategoryId?: Id<'eventLocationCategories'> | undefined;
        eventProductId: Id<'eventProducts'>;
      },
      Id<'eventProducts'>
    >;
    markAllVendorProductsAvailable: FunctionReference<
      'mutation',
      { vendorId: Id<'users'>; eventId: Id<'events'>; seenProductIds?: Id<'products'>[] },
      { updatedCount: number }
    >;
    markAllVendorProductsReturned: FunctionReference<
      'mutation',
      { vendorId: Id<'users'>; eventId: Id<'events'> },
      { updatedCount: number }
    >;
    /**
     * After the bazaar: returns the given items still available at once (#305), not those
     * of sellers paid out. Sold, announced and rejected items stay.
     */
    returnLeftovers: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; productIds: Id<'products'>[] },
      { returnedCount: number; sellerCount: number }
    >;
    undoReturn: FunctionReference<
      'mutation',
      { eventProductId: Id<'eventProducts'> },
      { success: boolean }
    >;
    /**
     * Turns down announced items the sellers did not hand in on time (only the given ones,
     * optionally of one seller); each seller gets one mail. They cannot be announced there
     * again.
     */
    rejectNotHandedIn: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        vendorId?: Id<'users'> | undefined;
        productIds: Id<'products'>[];
      },
      { rejectedCount: number; sellerCount: number }
    >;
    /** The item is announced again, as before */
    undoRejection: FunctionReference<
      'mutation',
      { eventProductId: Id<'eventProducts'> },
      { success: boolean }
    >;
    /** The signed-in seller's items turned down at this bazaar, newest first */
    getMyRejections: FunctionReference<'query', { eventId: Id<'events'> }, MyRejection[]>;
  };
  eventRoles: {
    isOrganizerOfAnyProductEvent: FunctionReference<
      'query',
      { userId?: Id<'users'> | undefined; productId: Id<'products'> },
      Id<'events'> | null
    >;
    getVendorsForEvent: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      VendorWithCalculations[]
    >;
    isSeller: FunctionReference<'query', { userId: Id<'users'> }, boolean>;
    getCoOrganizerIdsForEvent: FunctionReference<'query', { eventId: Id<'events'> }, Id<'users'>[]>;
    getMyRolesForEvent: FunctionReference<'query', { eventId: Id<'events'> }, string[]>;
    /** What the signed-in user may do at the event; empty outside the team */
    getMyPermissionsForEvent: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      HelperPermission[]
    >;
    getMyRolesForEvents: FunctionReference<
      'query',
      { eventIds: Id<'events'>[] },
      { eventId: Id<'events'>; roles: ('organizer' | 'seller' | 'coorganizer')[] }[]
    >;
    addCoOrganizerForEvent: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; userId: Id<'users'>; permissions?: HelperPermission[] | undefined },
      { success: boolean }
    >;
    setHelperPermissions: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; userId: Id<'users'>; permissions: HelperPermission[] },
      { success: boolean }
    >;
    removeCoOrganizerForEvent: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; userId: Id<'users'> },
      { success: boolean }
    >;
    transferOrganizer: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; userId: Id<'users'> },
      { success: boolean }
    >;
  };
  eventInvitations: {
    send: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; email: string; helper: boolean },
      { success: boolean }
    >;
    revoke: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; invitationId: Id<'eventInvitations'> },
      { success: boolean }
    >;
    listOpen: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      { _id: Id<'eventInvitations'>; email: string; helper: boolean; sentAt: number }[]
    >;
    getByToken: FunctionReference<
      'query',
      { token: string },
      {
        email: string;
        helper: boolean;
        event: NonNullable<Api['events']['getPublicEventForViewer']['_returnType']>;
      } | null
    >;
  };
  eventExclusions: {
    exclude: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; userId: Id<'users'>; reason?: string | undefined },
      { success: boolean }
    >;
    readmit: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; userId: Id<'users'> },
      { success: boolean }
    >;
    /** Whether the organizer excluded the signed-in user, and why */
    getMine: FunctionReference<'query', { eventId: Id<'events'> }, Exclusion | null>;
    /** The bazaars the organizer excluded the signed-in user from, for "Meine Basare" */
    getMyExcludedEvents: FunctionReference<
      'query',
      { includePast?: boolean | undefined },
      { event: Doc<'events'>; exclusion: Exclusion }[]
    >;
  };
  eventSeller: {
    joinEvent: FunctionReference<
      'mutation',
      {
        accessCode?: string | undefined;
        privateSeller?: boolean | undefined;
        invitation?: string | undefined;
        /** A self-declared fee group, checked at the intake (#302) */
        feeGroupId?: string | undefined;
        eventId: Id<'events'>;
      },
      Id<'eventSeller'>
    >;
    removeSellerAndCoorganizerRoles: FunctionReference<'mutation', EmptyObject, false | null>;
    /** Unregisters every seller without items (#304); returns how many */
    removeSellersWithoutItems: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; message?: string | undefined },
      number
    >;
    isEventSellerForEvent: FunctionReference<'query', { eventId: Id<'events'> }, boolean>;
    checkAccessCode: FunctionReference<
      'mutation',
      { accessCode?: string | undefined; eventId: Id<'events'> },
      boolean
    >;
    markVendorPayoutReceived: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        vendorUserId: Id<'users'>;
      },
      null
    >;
    settleVendor: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        vendorUserId: Id<'users'>;
      },
      { returned: number }
    >;
    unmarkVendorPayoutReceived: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        vendorUserId: Id<'users'>;
      },
      null
    >;
  };
  feeGroups: {
    getMyFeeGroup: FunctionReference<'query', { eventId: Id<'events'> }, MyFeeGroup | null>;
    /** The seller chooses a self-declared group, or none, until the first item is accepted */
    chooseFeeGroup: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; groupId: string | null },
      null
    >;
    /** The team saw the proof at the intake */
    confirmFeeGroup: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; sellerId: Id<'users'> },
      null
    >;
    /** The proof is missing: the bazaar's fees apply */
    removeFeeGroup: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; sellerId: Id<'users'> },
      null
    >;
    /** The organizer puts a seller in a group by hand, or takes them out */
    assignFeeGroup: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; sellerId: Id<'users'>; groupId: string | null },
      null
    >;
  };
  events: {
    getFeeLock: FunctionReference<'query', { eventId: Id<'events'> }, { locked: boolean } | null>;
    getMyEventDraft: FunctionReference<
      'query',
      Record<string, never>,
      { draft: unknown; updatedAt: number } | null
    >;
    saveEventDraft: FunctionReference<'mutation', { draft: unknown }, null>;
    deleteEventDraft: FunctionReference<'mutation', Record<string, never>, null>;
    getMyEvents: FunctionReference<
      'query',
      { includePast?: boolean | undefined },
      {
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        /** Picture of the region of a bazaar for its region (#304), made by the app */
        regionMapImage?: Id<'_storage'> | undefined;
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
        /** Places taken by sellers, only with a vendorLimit */
        sellerCount?: number | undefined;
        lastSellerNumber?: number | undefined;
        saleFeeFixed?: number | undefined;
        saleFeePercentage?: number | undefined;
        features?:
          | {
              questions?: boolean | undefined;
              minimumPrice?: boolean | undefined;
              discounts?: boolean | undefined;
              discountStartsAt?: number | undefined;
              maxDiscountPercent?: number | undefined;
              priceOffers?: boolean | undefined;
              questionsDuringEventOnly?: boolean | undefined;
              photosOptional?: boolean | undefined;
              publicCatalog?: boolean | undefined;
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              maxItemsTotal?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              labelMark?: 'universal' | 'none' | undefined;
              intakeFee?: number | undefined;
              maxFeesPerSeller?: number | undefined;
              feeGroups?: FeeGroup[] | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
              directSale?: boolean | undefined;
              autoReturn?: boolean | undefined;
            }
          | undefined;
        sellerLogistics?:
          | {
              dropoffStart?: number | undefined;
              dropoffEnd?: number | undefined;
              pickupStart?: number | undefined;
              pickupEnd?: number | undefined;
              note?: string | undefined;
            }
          | undefined;
        remindersSent?: { dayBefore?: number | undefined; pickup?: number | undefined } | undefined;
        categories: Id<'categories'>[];
        title: string;
        description: string;
        location: string;
        street?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: EventServices[];
        visibility: 'public' | 'logged-in' | 'approved';
        commission: number;
        organizerId: Id<'users'>;
      }[]
    >;
    get: FunctionReference<
      'query',
      { includePast?: boolean | undefined },
      {
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        /** Picture of the region of a bazaar for its region (#304), made by the app */
        regionMapImage?: Id<'_storage'> | undefined;
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
        /** Places taken by sellers, only with a vendorLimit */
        sellerCount?: number | undefined;
        lastSellerNumber?: number | undefined;
        saleFeeFixed?: number | undefined;
        saleFeePercentage?: number | undefined;
        features?:
          | {
              questions?: boolean | undefined;
              minimumPrice?: boolean | undefined;
              discounts?: boolean | undefined;
              discountStartsAt?: number | undefined;
              maxDiscountPercent?: number | undefined;
              priceOffers?: boolean | undefined;
              questionsDuringEventOnly?: boolean | undefined;
              photosOptional?: boolean | undefined;
              publicCatalog?: boolean | undefined;
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              maxItemsTotal?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              labelMark?: 'universal' | 'none' | undefined;
              intakeFee?: number | undefined;
              maxFeesPerSeller?: number | undefined;
              feeGroups?: FeeGroup[] | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
              directSale?: boolean | undefined;
              autoReturn?: boolean | undefined;
            }
          | undefined;
        sellerLogistics?:
          | {
              dropoffStart?: number | undefined;
              dropoffEnd?: number | undefined;
              pickupStart?: number | undefined;
              pickupEnd?: number | undefined;
              note?: string | undefined;
            }
          | undefined;
        remindersSent?: { dayBefore?: number | undefined; pickup?: number | undefined } | undefined;
        categories: Id<'categories'>[];
        title: string;
        description: string;
        location: string;
        street?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: EventServices[];
        visibility: 'public' | 'logged-in' | 'approved';
        commission: number;
        organizerId: Id<'users'>;
      }[]
    >;
    getPublicEventsForAdmin: FunctionReference<
      'query',
      EmptyObject,
      {
        organizerName: string | undefined;
        organizerEmail: string | undefined;
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        /** Picture of the region of a bazaar for its region (#304), made by the app */
        regionMapImage?: Id<'_storage'> | undefined;
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
        /** Places taken by sellers, only with a vendorLimit */
        sellerCount?: number | undefined;
        lastSellerNumber?: number | undefined;
        saleFeeFixed?: number | undefined;
        saleFeePercentage?: number | undefined;
        features?:
          | {
              questions?: boolean | undefined;
              minimumPrice?: boolean | undefined;
              discounts?: boolean | undefined;
              discountStartsAt?: number | undefined;
              maxDiscountPercent?: number | undefined;
              priceOffers?: boolean | undefined;
              questionsDuringEventOnly?: boolean | undefined;
              photosOptional?: boolean | undefined;
              publicCatalog?: boolean | undefined;
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              maxItemsTotal?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              labelMark?: 'universal' | 'none' | undefined;
              intakeFee?: number | undefined;
              maxFeesPerSeller?: number | undefined;
              feeGroups?: FeeGroup[] | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
              directSale?: boolean | undefined;
              autoReturn?: boolean | undefined;
            }
          | undefined;
        sellerLogistics?:
          | {
              dropoffStart?: number | undefined;
              dropoffEnd?: number | undefined;
              pickupStart?: number | undefined;
              pickupEnd?: number | undefined;
              note?: string | undefined;
            }
          | undefined;
        remindersSent?: { dayBefore?: number | undefined; pickup?: number | undefined } | undefined;
        categories: Id<'categories'>[];
        title: string;
        description: string;
        location: string;
        street?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: EventServices[];
        visibility: 'public' | 'logged-in' | 'approved';
        commission: number;
        organizerId: Id<'users'>;
      }[]
    >;
    getEventsForAdmin: FunctionReference<
      'query',
      EmptyObject,
      {
        isApproved: boolean;
        approvalStatus: 'approved' | 'pending' | 'rejected';
        organizerName: string | undefined;
        organizerEmail: string | undefined;
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        /** Picture of the region of a bazaar for its region (#304), made by the app */
        regionMapImage?: Id<'_storage'> | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
        /** Places taken by sellers, only with a vendorLimit */
        sellerCount?: number | undefined;
        lastSellerNumber?: number | undefined;
        saleFeeFixed?: number | undefined;
        saleFeePercentage?: number | undefined;
        features?:
          | {
              questions?: boolean | undefined;
              minimumPrice?: boolean | undefined;
              discounts?: boolean | undefined;
              discountStartsAt?: number | undefined;
              maxDiscountPercent?: number | undefined;
              priceOffers?: boolean | undefined;
              questionsDuringEventOnly?: boolean | undefined;
              photosOptional?: boolean | undefined;
              publicCatalog?: boolean | undefined;
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              maxItemsTotal?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              labelMark?: 'universal' | 'none' | undefined;
              intakeFee?: number | undefined;
              maxFeesPerSeller?: number | undefined;
              feeGroups?: FeeGroup[] | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
              directSale?: boolean | undefined;
              autoReturn?: boolean | undefined;
            }
          | undefined;
        sellerLogistics?:
          | {
              dropoffStart?: number | undefined;
              dropoffEnd?: number | undefined;
              pickupStart?: number | undefined;
              pickupEnd?: number | undefined;
              note?: string | undefined;
            }
          | undefined;
        remindersSent?: { dayBefore?: number | undefined; pickup?: number | undefined } | undefined;
        categories: Id<'categories'>[];
        title: string;
        description: string;
        location: string;
        street?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: EventServices[];
        visibility: 'public' | 'logged-in' | 'approved';
        commission: number;
        organizerId: Id<'users'>;
      }[]
    >;
    approveEventForAdmin: FunctionReference<'mutation', { eventId: Id<'events'> }, null>;
    rejectEventForAdmin: FunctionReference<
      'mutation',
      { reason: string; eventId: Id<'events'> },
      null
    >;
    requestEventReviewForOrganizer: FunctionReference<'mutation', { eventId: Id<'events'> }, null>;
    getEvent: FunctionReference<
      'query',
      { id: Id<'events'> },
      {
        coverImageUrl: string | null;
        eventMapImageUrl: string | null;
        categoryLabels: string[];
        /** Places for items left on the whole market; only with maxItemsTotal */
        itemPlacesLeft?: number;
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        /** Picture of the region of a bazaar for its region (#304), made by the app */
        regionMapImage?: Id<'_storage'> | undefined;
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
        /** Places taken by sellers, only with a vendorLimit */
        sellerCount?: number | undefined;
        lastSellerNumber?: number | undefined;
        saleFeeFixed?: number | undefined;
        saleFeePercentage?: number | undefined;
        features?:
          | {
              questions?: boolean | undefined;
              minimumPrice?: boolean | undefined;
              discounts?: boolean | undefined;
              discountStartsAt?: number | undefined;
              maxDiscountPercent?: number | undefined;
              priceOffers?: boolean | undefined;
              questionsDuringEventOnly?: boolean | undefined;
              photosOptional?: boolean | undefined;
              publicCatalog?: boolean | undefined;
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              maxItemsTotal?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              labelMark?: 'universal' | 'none' | undefined;
              intakeFee?: number | undefined;
              maxFeesPerSeller?: number | undefined;
              feeGroups?: FeeGroup[] | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
              directSale?: boolean | undefined;
              autoReturn?: boolean | undefined;
            }
          | undefined;
        sellerLogistics?:
          | {
              dropoffStart?: number | undefined;
              dropoffEnd?: number | undefined;
              pickupStart?: number | undefined;
              pickupEnd?: number | undefined;
              note?: string | undefined;
            }
          | undefined;
        remindersSent?: { dayBefore?: number | undefined; pickup?: number | undefined } | undefined;
        categories: Id<'categories'>[];
        title: string;
        description: string;
        location: string;
        street?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: EventServices[];
        visibility: 'public' | 'logged-in' | 'approved';
        commission: number;
        organizerId: Id<'users'>;
      } | null
    >;
    getPublicEventForViewer: FunctionReference<
      'query',
      { id: Id<'events'> },
      {
        coverImageUrl: string | null;
        eventMapImageUrl: string | null;
        categoryLabels: string[];
        /** Places for items left on the whole market; only with maxItemsTotal */
        itemPlacesLeft?: number;
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        /** Picture of the region of a bazaar for its region (#304), made by the app */
        regionMapImage?: Id<'_storage'> | undefined;
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
        /** Places taken by sellers, only with a vendorLimit */
        sellerCount?: number | undefined;
        lastSellerNumber?: number | undefined;
        saleFeeFixed?: number | undefined;
        saleFeePercentage?: number | undefined;
        features?:
          | {
              questions?: boolean | undefined;
              minimumPrice?: boolean | undefined;
              discounts?: boolean | undefined;
              discountStartsAt?: number | undefined;
              maxDiscountPercent?: number | undefined;
              priceOffers?: boolean | undefined;
              questionsDuringEventOnly?: boolean | undefined;
              photosOptional?: boolean | undefined;
              publicCatalog?: boolean | undefined;
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              maxItemsTotal?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              labelMark?: 'universal' | 'none' | undefined;
              intakeFee?: number | undefined;
              maxFeesPerSeller?: number | undefined;
              feeGroups?: FeeGroup[] | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
              directSale?: boolean | undefined;
              autoReturn?: boolean | undefined;
            }
          | undefined;
        sellerLogistics?:
          | {
              dropoffStart?: number | undefined;
              dropoffEnd?: number | undefined;
              pickupStart?: number | undefined;
              pickupEnd?: number | undefined;
              note?: string | undefined;
            }
          | undefined;
        remindersSent?: { dayBefore?: number | undefined; pickup?: number | undefined } | undefined;
        categories: Id<'categories'>[];
        title: string;
        description: string;
        location: string;
        street?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: EventServices[];
        visibility: 'public' | 'logged-in' | 'approved';
        commission: number;
        organizerId: Id<'users'>;
      } | null
    >;
    getEvents: FunctionReference<
      'query',
      { ids: Id<'events'>[] },
      {
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        /** Picture of the region of a bazaar for its region (#304), made by the app */
        regionMapImage?: Id<'_storage'> | undefined;
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
        /** Places taken by sellers, only with a vendorLimit */
        sellerCount?: number | undefined;
        lastSellerNumber?: number | undefined;
        saleFeeFixed?: number | undefined;
        saleFeePercentage?: number | undefined;
        features?:
          | {
              questions?: boolean | undefined;
              minimumPrice?: boolean | undefined;
              discounts?: boolean | undefined;
              discountStartsAt?: number | undefined;
              maxDiscountPercent?: number | undefined;
              priceOffers?: boolean | undefined;
              questionsDuringEventOnly?: boolean | undefined;
              photosOptional?: boolean | undefined;
              publicCatalog?: boolean | undefined;
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              maxItemsTotal?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              labelMark?: 'universal' | 'none' | undefined;
              intakeFee?: number | undefined;
              maxFeesPerSeller?: number | undefined;
              feeGroups?: FeeGroup[] | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
              directSale?: boolean | undefined;
              autoReturn?: boolean | undefined;
            }
          | undefined;
        sellerLogistics?:
          | {
              dropoffStart?: number | undefined;
              dropoffEnd?: number | undefined;
              pickupStart?: number | undefined;
              pickupEnd?: number | undefined;
              note?: string | undefined;
            }
          | undefined;
        remindersSent?: { dayBefore?: number | undefined; pickup?: number | undefined } | undefined;
        categories: Id<'categories'>[];
        title: string;
        description: string;
        location: string;
        street?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: EventServices[];
        visibility: 'public' | 'logged-in' | 'approved';
        commission: number;
        organizerId: Id<'users'>;
      }[]
    >;
    createEvent: FunctionReference<
      'mutation',
      {
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        /** Picture of the region of a bazaar for its region (#304), made by the app */
        regionMapImage?: Id<'_storage'> | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
        /** Places taken by sellers, only with a vendorLimit */
        sellerCount?: number | undefined;
        features?:
          | {
              questions?: boolean | undefined;
              minimumPrice?: boolean | undefined;
              discounts?: boolean | undefined;
              discountStartsAt?: number | undefined;
              maxDiscountPercent?: number | undefined;
              priceOffers?: boolean | undefined;
              questionsDuringEventOnly?: boolean | undefined;
              photosOptional?: boolean | undefined;
              publicCatalog?: boolean | undefined;
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              /** null clears it; left out, the stored value stays (older apps) */
              maxItemsTotal?: number | null | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              labelMark?: 'universal' | 'none' | undefined;
              intakeFee?: number | undefined;
              maxFeesPerSeller?: number | null | undefined;
              feeGroups?: FeeGroup[] | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
              directSale?: boolean | undefined;
              autoReturn?: boolean | undefined;
            }
          | undefined;
        sellerLogistics?:
          | {
              dropoffStart?: number | undefined;
              dropoffEnd?: number | undefined;
              pickupStart?: number | undefined;
              pickupEnd?: number | undefined;
              note?: string | undefined;
            }
          | undefined;
        categories: Id<'categories'>[];
        title: string;
        description: string;
        location: string;
        address?:
          | { street?: string; postalCode?: string; city?: string; country?: string }
          | undefined;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: string[];
        visibility: string;
        commission: number;
      },
      Id<'events'>
    >;
    editEvent: FunctionReference<
      'mutation',
      {
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        /** Picture of the region of a bazaar for its region (#304), made by the app */
        regionMapImage?: Id<'_storage'> | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
        /** Places taken by sellers, only with a vendorLimit */
        sellerCount?: number | undefined;
        features?:
          | {
              questions?: boolean | undefined;
              minimumPrice?: boolean | undefined;
              discounts?: boolean | undefined;
              discountStartsAt?: number | undefined;
              maxDiscountPercent?: number | undefined;
              priceOffers?: boolean | undefined;
              questionsDuringEventOnly?: boolean | undefined;
              photosOptional?: boolean | undefined;
              publicCatalog?: boolean | undefined;
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              /** null clears it; left out, the stored value stays (older apps) */
              maxItemsTotal?: number | null | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              labelMark?: 'universal' | 'none' | undefined;
              intakeFee?: number | undefined;
              maxFeesPerSeller?: number | null | undefined;
              feeGroups?: FeeGroup[] | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
              directSale?: boolean | undefined;
              autoReturn?: boolean | undefined;
            }
          | undefined;
        sellerLogistics?:
          | {
              dropoffStart?: number | undefined;
              dropoffEnd?: number | undefined;
              pickupStart?: number | undefined;
              pickupEnd?: number | undefined;
              note?: string | undefined;
            }
          | undefined;
        clearVendorLimit?: boolean | undefined;
        clearCoverImage?: boolean | undefined;
        clearEventMapImage?: boolean | undefined;
        clearRegionMapImage?: boolean | undefined;
        categories: Id<'categories'>[];
        id: Id<'events'>;
        title: string;
        description: string;
        location: string;
        address?:
          | { street?: string; postalCode?: string; city?: string; country?: string }
          | undefined;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: string[];
        visibility: string;
        commission: number;
      },
      null
    >;
    /** Organizer's quick switch: opening means now, closing keeps the window */
    setRegistrationOpen: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; open: boolean },
      null
    >;
    deleteEvent: FunctionReference<'mutation', { id: Id<'events'> }, null>;
    getMyRegisteredEvents: FunctionReference<
      'query',
      { includePast?: boolean | undefined },
      {
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        /** Picture of the region of a bazaar for its region (#304), made by the app */
        regionMapImage?: Id<'_storage'> | undefined;
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
        /** Places taken by sellers, only with a vendorLimit */
        sellerCount?: number | undefined;
        lastSellerNumber?: number | undefined;
        saleFeeFixed?: number | undefined;
        saleFeePercentage?: number | undefined;
        features?:
          | {
              questions?: boolean | undefined;
              minimumPrice?: boolean | undefined;
              discounts?: boolean | undefined;
              discountStartsAt?: number | undefined;
              maxDiscountPercent?: number | undefined;
              priceOffers?: boolean | undefined;
              questionsDuringEventOnly?: boolean | undefined;
              photosOptional?: boolean | undefined;
              publicCatalog?: boolean | undefined;
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              maxItemsTotal?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              labelMark?: 'universal' | 'none' | undefined;
              intakeFee?: number | undefined;
              maxFeesPerSeller?: number | undefined;
              feeGroups?: FeeGroup[] | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
              directSale?: boolean | undefined;
              autoReturn?: boolean | undefined;
            }
          | undefined;
        sellerLogistics?:
          | {
              dropoffStart?: number | undefined;
              dropoffEnd?: number | undefined;
              pickupStart?: number | undefined;
              pickupEnd?: number | undefined;
              note?: string | undefined;
            }
          | undefined;
        remindersSent?: { dayBefore?: number | undefined; pickup?: number | undefined } | undefined;
        categories: Id<'categories'>[];
        title: string;
        description: string;
        location: string;
        street?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: EventServices[];
        visibility: 'public' | 'logged-in' | 'approved';
        commission: number;
        organizerId: Id<'users'>;
      }[]
    >;
    leaveEvent: FunctionReference<'mutation', { eventId: Id<'events'> }, null>;
    getMyProductCountForEvent: FunctionReference<'query', { eventId: Id<'events'> }, number>;
    getEventFinancialSummary: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      {
        totalGrossRevenue: number;
        totalNetRevenue: number;
        totalDiscounts: number;
        totalCommission: number;
        /** Paid to the seller at the item; the till holds only their commission */
        totalDirectSales: number;
        totalDirectCommission: number;
        totalPayoutSoll: number;
        totalPaidOut: number;
        totalPendingPayout: number;
        totalIntakeFees: number;
        /** Fees above the cap given back to sellers; missing from older backends */
        totalFeeCapCredits?: number;
        totalFeesCollected: number;
        totalFeesToCollect: number;
        sellersToCollect: { name: string; sellerNumber: number | undefined; amount: number }[];
        cashInHandSoll: number;
        salesCount: number;
        vendorsPaidCount: number;
        vendorsTotalCount: number;
      }
    >;
    countPendingApprovals: FunctionReference<'query', EmptyObject, number>;
  };
  featureFlags: {
    get: FunctionReference<'query', { key?: string | undefined }, { [x: string]: boolean }>;
  };
  instance: {
    getConfig: FunctionReference<
      'query',
      EmptyObject,
      {
        mode: 'platform' | 'single';
        /** Version of the API for the mobile app; missing before the app existed */
        appApi: number | undefined;
        brand: string;
        name: string | undefined;
        contactEmail: string | undefined;
        logoUrl: string | null;
        startPage: 'overview' | 'currentEvent';
        plausible: {
          enabled: boolean | undefined;
          domain: string | undefined;
          apiHost: string | undefined;
        };
      }
    >;
    updateSettings: FunctionReference<
      'mutation',
      {
        name?: string | undefined;
        contactEmail?: string | undefined;
        logo?: Id<'_storage'> | null | undefined;
        startPage?: 'overview' | 'currentEvent' | undefined;
        plausible?: { enabled: boolean; domain: string; apiHost: string } | undefined;
      },
      null
    >;
    getCurrentEvent: FunctionReference<
      'query',
      EmptyObject,
      { _id: Id<'events'>; title: string; startDate: number } | null
    >;
    getMyAccess: FunctionReference<
      'query',
      EmptyObject,
      { canOrganize: boolean; canCreateEvents: boolean }
    >;
  };
  labels: {
    getMyBasketLabel: FunctionReference<
      'query',
      EmptyObject,
      { sortCode: number; name?: string | undefined } | null
    >;
    getEventLabelIds: FunctionReference<'query', { eventId: Id<'events'> }, Id<'products'>[]>;
    getSortMarkClashes: FunctionReference<'query', { eventIds: Id<'events'>[] }, Id<'events'>[]>;
    getLabelData: FunctionReference<
      'query',
      { eventId?: Id<'events'> | undefined; productIds: Id<'products'>[] },
      {
        format: 'small' | 'standard';
        labels: {
          productId: Id<'products'>;
          title: string;
          sellerNumber: number | undefined;
          sortCode: number | undefined;
          size: string | undefined;
          price: number | undefined;
        }[];
      }
    >;
  };
  messages: {
    sendMessage: FunctionReference<
      'mutation',
      { name: string; email: string; message: string; acceptedPrivacyPolicy: boolean },
      Id<'messages'>
    >;
  };
  moderation: {
    reportContent: FunctionReference<
      'mutation',
      {
        email?: string | undefined;
        reason: 'illegal' | 'fraud' | 'offensive' | 'personalData' | 'spam' | 'other';
        targetType: 'user' | 'event' | 'product' | 'question';
        targetId: string;
        details: string;
      },
      null
    >;
    getOverview: FunctionReference<
      'query',
      EmptyObject,
      {
        openReports: number;
        pendingEvents: number;
        unhandledMessages: number;
        runningEvents: number;
        upcomingEvents: number;
        users: number | undefined;
        newUsers: number;
        bannedUsers: number;
        products: number | undefined;
        statsUpdatedAt: number | undefined;
        hiddenProducts: number;
        hiddenEvents: number;
      }
    >;
    listReports: FunctionReference<
      'query',
      { status: 'open' | 'resolved' | 'dismissed' },
      {
        target: TargetInfo;
        reportCount: number;
        reporterLabel: string;
        resolverName: string | undefined;
        _id: Id<'reports'>;
        _creationTime: number;
        reporterId?: Id<'users'> | undefined;
        reporterEmail?: string | undefined;
        resolvedAt?: number | undefined;
        resolvedBy?: Id<'users'> | undefined;
        resolutionNote?: string | undefined;
        status: 'open' | 'resolved' | 'dismissed';
        reason: 'illegal' | 'fraud' | 'offensive' | 'personalData' | 'spam' | 'other';
        createdAt: number;
        targetType: 'user' | 'event' | 'product' | 'question';
        targetId: string;
        details: string;
      }[]
    >;
    resolveReport: FunctionReference<
      'mutation',
      {
        note?: string | undefined;
        status: 'resolved' | 'dismissed';
        reportId: Id<'reports'>;
      },
      null
    >;
    hideProduct: FunctionReference<
      'mutation',
      {
        reportId?: Id<'reports'> | undefined;
        reason: string;
        productId: Id<'products'>;
      },
      null
    >;
    restoreProduct: FunctionReference<'mutation', { productId: Id<'products'> }, null>;
    hideEvent: FunctionReference<
      'mutation',
      {
        reportId?: Id<'reports'> | undefined;
        reason: string;
        eventId: Id<'events'>;
      },
      null
    >;
    restoreEvent: FunctionReference<'mutation', { eventId: Id<'events'> }, null>;
    deleteQuestion: FunctionReference<
      'mutation',
      {
        reportId?: Id<'reports'> | undefined;
        reason: string;
        questionId: Id<'productQuestions'>;
      },
      null
    >;
    banUser: FunctionReference<
      'mutation',
      {
        reportId?: Id<'reports'> | undefined;
        reason: string;
        userId: Id<'users'>;
      },
      null
    >;
    unbanUser: FunctionReference<'mutation', { userId: Id<'users'> }, null>;
    listProducts: FunctionReference<
      'query',
      {
        search?: string | undefined;
        vendorId?: Id<'users'> | undefined;
        onlyHidden?: boolean | undefined;
        page?: number | undefined;
      },
      {
        items: {
          _id: Id<'products'>;
          _creationTime: number;
          title: string;
          description: string;
          price: number;
          sold: boolean;
          moderation: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
          imageUrl: string | null;
          vendorId: Id<'users'>;
          vendorName: string;
        }[];
        page: number;
        totalPages: number;
      }
    >;
    listQuestions: FunctionReference<
      'query',
      {
        search?: string | undefined;
        askerId?: Id<'users'> | undefined;
        page?: number | undefined;
      },
      {
        items: {
          productTitle: string;
          askerName: string;
          _id: Id<'productQuestions'>;
          _creationTime: number;
          answer?: string | undefined;
          answeredBy?: Id<'users'> | undefined;
          answeredAt?: number | undefined;
          eventId: Id<'events'>;
          productId: Id<'products'>;
          createdAt: number;
          askerId: Id<'users'>;
          question: string;
        }[];
        page: number;
        totalPages: number;
      }
    >;
    getUserSummary: FunctionReference<
      'query',
      { userId: Id<'users'> },
      {
        _id: Id<'users'>;
        name: string | undefined;
        email: string | undefined;
        phone: string | undefined;
        status: 'notVerified' | 'active' | 'inactive' | 'deleted' | 'banned';
        systemRole: 'admin' | 'user' | undefined;
        createdAt: number;
        lastLoginAt: number | undefined;
        isWalkIn: boolean;
        productCount: number;
        hiddenProductCount: number;
        events: { _id: Id<'events'>; title: string; hidden: boolean }[];
        questionCount: number;
        sellerEventCount: number;
        reportCount: number;
        history: {
          _id: Id<'moderationLog'>;
          _creationTime: number;
          reason?: string | undefined;
          reportId?: Id<'reports'> | undefined;
          createdAt: number;
          targetType: 'user' | 'event' | 'product' | 'question';
          targetId: string;
          adminId: Id<'users'>;
          action:
            | 'hideProduct'
            | 'restoreProduct'
            | 'hideEvent'
            | 'restoreEvent'
            | 'deleteQuestion'
            | 'banUser'
            | 'unbanUser'
            | 'approveEvent'
            | 'rejectEvent'
            | 'resolveReport'
            | 'dismissReport';
          targetLabel: string;
        }[];
      } | null
    >;
    listMessages: FunctionReference<
      'query',
      { handled: boolean },
      {
        _id: Id<'messages'>;
        _creationTime: number;
        handledAt?: number | undefined;
        handledBy?: Id<'users'> | undefined;
        name: string;
        email: string;
        createdAt: number;
        message: string;
        acceptedPrivacyPolicy: boolean;
      }[]
    >;
    setMessageHandled: FunctionReference<
      'mutation',
      { handled: boolean; messageId: Id<'messages'> },
      null
    >;
    listLog: FunctionReference<
      'query',
      EmptyObject,
      {
        adminName: string;
        _id: Id<'moderationLog'>;
        _creationTime: number;
        reason?: string | undefined;
        reportId?: Id<'reports'> | undefined;
        createdAt: number;
        targetType: 'user' | 'event' | 'product' | 'question';
        targetId: string;
        adminId: Id<'users'>;
        action:
          | 'hideProduct'
          | 'restoreProduct'
          | 'hideEvent'
          | 'restoreEvent'
          | 'deleteQuestion'
          | 'banUser'
          | 'unbanUser'
          | 'approveEvent'
          | 'rejectEvent'
          | 'resolveReport'
          | 'dismissReport';
        targetLabel: string;
      }[]
    >;
    isViewerAdmin: FunctionReference<'query', EmptyObject, boolean>;
    getMenuCounts: FunctionReference<
      'query',
      EmptyObject,
      { openReports: number; unhandledMessages: number } | null
    >;
  };
  notifications: {
    getUnreadNoticeCounts: FunctionReference<
      'query',
      EmptyObject,
      { events: number; messages: number; participation: number; products: number; sales: number }
    >;
    markNoticesSeen: FunctionReference<
      'mutation',
      {
        eventId?: Id<'events'> | undefined;
        area: 'events' | 'messages' | 'participation' | 'products' | 'sales';
      },
      null
    >;
    getMyNotificationPrefs: FunctionReference<
      'query',
      EmptyObject,
      Record<'offers' | 'reminders' | 'sales' | 'questions' | 'buyer' | 'organizer', boolean> | null
    >;
    updateMyNotificationPrefs: FunctionReference<
      'mutation',
      {
        prefs: {
          offers?: boolean | undefined;
          reminders?: boolean | undefined;
          sales?: boolean | undefined;
          questions?: boolean | undefined;
          buyer?: boolean | undefined;
          organizer?: boolean | undefined;
        };
      },
      null
    >;
    getUnsubscribeInfo: FunctionReference<
      'query',
      {
        category: 'offers' | 'reminders' | 'sales' | 'questions' | 'buyer' | 'organizer';
        token: string;
      },
      { category: string; subscribed: boolean; canLogIn: boolean } | null
    >;
    unsubscribe: FunctionReference<
      'mutation',
      {
        category: 'offers' | 'reminders' | 'sales' | 'questions' | 'buyer' | 'organizer';
        token: string;
      },
      null
    >;
  };
  offline: {
    replay: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        actions: { id: string; name: string; args: unknown; label: string; doneAt: number }[];
      },
      { id: string; doneNow: boolean; error?: string }[]
    >;
    getFailedActions: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      {
        _id: string;
        name: string;
        label: string;
        error: string;
        /** The German text, for rows from before errorParams */
        errorMessage: string;
        errorParams?: Record<string, string | number>;
        errorCause?: { code: string; params?: Record<string, string | number> };
        doneAt: number;
        userName?: string;
        resolvedAt?: number;
      }[]
    >;
    resolveFailedAction: FunctionReference<'mutation', { actionId: string }, { success: boolean }>;
    ensureCheckInSecret: FunctionReference<
      'mutation',
      Record<string, never>,
      { userId: string; keys: { eventId: Id<'events'>; version: number; secret: string }[] }
    >;
    getCheckInSecretsForEvent: FunctionReference<
      'mutation',
      { eventId: Id<'events'> },
      { userId: string; secret: string }[]
    >;
    renewCheckInKeys: FunctionReference<
      'mutation',
      { eventId: Id<'events'> },
      { success: boolean }
    >;
    getOwnCheckInVersions: FunctionReference<
      'query',
      Record<string, never>,
      { eventId: Id<'events'>; version: number }[]
    >;
    getPreparationStamp: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      { keys: string; products: string }
    >;
  };
  offers: {
    makeOffer: FunctionReference<
      'mutation',
      {
        message?: string | undefined;
        productId: Id<'products'>;
        amount: number;
      },
      Id<'productOffers'>
    >;
    withdrawOffer: FunctionReference<'mutation', { offerId: Id<'productOffers'> }, null>;
    respondToOffer: FunctionReference<
      'mutation',
      { offerId: Id<'productOffers'>; accept: boolean },
      null
    >;
    getOffersForProduct: FunctionReference<
      'query',
      { productId: Id<'products'> },
      {
        _id: Id<'productOffers'>;
        amount: number;
        message: string | undefined;
        status: 'pending' | 'rejected' | 'accepted' | 'withdrawn' | 'redeemed';
        createdAt: number;
        buyerName: string;
      }[]
    >;
    getOffersForStaff: FunctionReference<
      'query',
      { productId: Id<'products'> },
      {
        offers: {
          _id: Id<'productOffers'>;
          amount: number;
          message: string | undefined;
          status: 'pending' | 'rejected' | 'accepted' | 'withdrawn' | 'redeemed';
          createdAt: number;
          buyerName: string;
        }[];
        canRespond: boolean;
      }
    >;
    getMyOfferForProduct: FunctionReference<
      'query',
      { productId: Id<'products'> },
      {
        _id: Id<'productOffers'>;
        amount: number;
        message: string | undefined;
        status: 'pending' | 'rejected' | 'accepted' | 'withdrawn' | 'redeemed';
        createdAt: number;
        buyerName: string;
      } | null
    >;
    getAcceptedOffersForEventProduct: FunctionReference<
      'query',
      { eventProductId: Id<'eventProducts'> },
      {
        buyerName: string;
        _id: Id<'productOffers'>;
        amount: number;
        message: string | undefined;
        status: 'pending' | 'rejected' | 'accepted' | 'withdrawn' | 'redeemed';
        createdAt: number;
      }[]
    >;
  };
  productQuestions: {
    listForProduct: FunctionReference<
      'query',
      { productId: Id<'products'> },
      {
        _id: Id<'productQuestions'>;
        question: string;
        answer: string | undefined;
        createdAt: number;
        answeredAt: number | undefined;
        askerName: string;
        isMine: boolean;
        canAnswer: boolean;
      }[]
    >;
    ask: FunctionReference<
      'mutation',
      { productId: Id<'products'>; question: string },
      Id<'productQuestions'>
    >;
    answer: FunctionReference<
      'mutation',
      { answer: string; questionId: Id<'productQuestions'> },
      null
    >;
    remove: FunctionReference<'mutation', { questionId: Id<'productQuestions'> }, null>;
  };
  products: {
    generateUploadUrl: FunctionReference<'mutation', EmptyObject, string>;
    addProduct: FunctionReference<
      'mutation',
      {
        attributes?: Record<string, string> | undefined;
        acceptsOffers?: boolean | undefined;
        minimumPrice?: number | undefined;
        title: string;
        vendorId: Id<'users'>;
        description: string;
        condition: 'new' | 'very-good' | 'good' | 'ok';
        images: Id<'_storage'>[];
        productCategory: Id<'categories'>;
        price: number;
        readyForSale: boolean;
        sold: boolean;
      },
      Id<'products'>
    >;
    updateProduct: FunctionReference<
      'mutation',
      {
        attributes?: Record<string, string> | undefined;
        acceptsOffers?: boolean | undefined;
        minimumPrice?: number | undefined;
        title: string;
        description: string;
        condition: 'new' | 'very-good' | 'good' | 'ok';
        images: Id<'_storage'>[];
        productCategory: Id<'categories'>;
        price: number;
        readyForSale: boolean;
        productId: Id<'products'>;
      },
      null
    >;
    addProductImages: FunctionReference<
      'mutation',
      { images: Id<'_storage'>[]; productId: Id<'products'> },
      null
    >;
    addProductAttributes: FunctionReference<
      'mutation',
      { attributes: { [x: string]: string }; productId: Id<'products'> },
      null
    >;
    setProductReadyForSale: FunctionReference<
      'mutation',
      { readyForSale: boolean; productId: Id<'products'> },
      null
    >;
    deleteProduct: FunctionReference<'mutation', { id: Id<'products'> }, null>;
    deleteProducts: FunctionReference<'mutation', { ids: Id<'products'>[] }, null>;
    canDeleteProduct: FunctionReference<'query', { productId: Id<'products'> }, boolean>;
    getProduct: FunctionReference<
      'query',
      { productId: Id<'products'> },
      | (Omit<
          {
            _id: Id<'products'>;
            _creationTime: number;
            moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
            attributes?: Record<string, string> | undefined;
            acceptsOffers?: boolean | undefined;
            minimumPrice?: number | undefined;
            updatedAt: number;
            title: string;
            vendorId: Id<'users'>;
            description: string;
            condition: 'new' | 'very-good' | 'good' | 'ok';
            images: Id<'_storage'>[];
            productCategory: Id<'categories'>;
            price: number;
            readyForSale: boolean;
            sold: boolean;
          },
          'minimumPrice'
        > & {
          minimumPrice?: number | undefined;
          attributeList: CategoryAttribute[];
          activeListing: {
            eventId: Id<'events'>;
            eventProductId: Id<'eventProducts'>;
            eventTitle: string;
            features: EventFeatures;
            mayParticipate: boolean;
            status: string;
            startDate: number;
            endDate: number;
          } | null;
          isNegotiable: boolean;
          indexable: boolean;
          vendorPhone?: string | undefined;
          vendorFirstName?: string | undefined;
          vendorLastName?: string | undefined;
          categoryName: string;
          isOrganizer: boolean;
          organizerEventId: Id<'events'> | null;
          discountPercent?: number | undefined;
          discountRules?: DiscountRules | undefined;
          isLocked: boolean;
          eventStatus?: string | undefined;
          isAvailable?: boolean | undefined;
        })
      | null
    >;
    getImageUrls: FunctionReference<'query', { storageIds: Id<'_storage'>[] }, string[]>;
    getMyProducts: FunctionReference<'query', EmptyObject, ProductWithEvents[]>;
    getProductsWithEvents: FunctionReference<'query', EmptyObject, ProductWithEvents[]>;
  };
  promos: {
    /** Texts and choices of the promo page; the app owns their shape (lib/promo) */
    getPromo: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      { promo: Record<string, unknown>; updatedAt: number } | null
    >;
    savePromo: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; promo: Record<string, unknown> },
      null
    >;
  };
  purchases: {
    sellProduct: FunctionReference<
      'mutation',
      {
        offerId?: Id<'productOffers'> | undefined;
        buyerEmail?: string | undefined;
        negotiatedPrice?: number | undefined;
        eventProductId: Id<'eventProducts'>;
      },
      Id<'purchase'>
    >;
    sellProducts: FunctionReference<
      'mutation',
      {
        buyerEmail?: string | undefined;
        items: {
          offerId?: Id<'productOffers'> | undefined;
          negotiatedPrice?: number | undefined;
          eventProductId: Id<'eventProducts'>;
        }[];
        /** From the app: a retry after a lost reply returns the first sale */
        deskSaleId?: string | undefined;
      },
      {
        purchaseIds: Id<'purchase'>[];
        total: number;
        /** What the desk took: the total, at direct sales only their commission */
        taken: number;
      }
    >;
    getCheckoutItem: FunctionReference<
      'query',
      { eventId: Id<'events'>; productId: string },
      {
        eventProductId: Id<'eventProducts'>;
        productId: Id<'products'>;
        title: string;
        image: Id<'_storage'>;
        status: EventProductStatus;
        price: number;
        discountPercent: number | undefined;
        listPrice: number;
        minimumPrice: number | undefined;
        sellerPaidOut: boolean;
        attributes: CategoryAttribute[];
        internalNote?: string;
        /** The seller, so a cart shares the rest of the fee cap among their items */
        sellerId: Id<'users'>;
        /** Direct sale with a fee cap: the commission the seller still pays at most */
        feeCapLeft?: number;
        /** The seller's commission in percent, when their fee group has its own (#302) */
        commissionPercent?: number;
      } | null
    >;
    getCheckoutSnapshot: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      {
        takenAt: number;
        items: (NonNullable<Api['purchases']['getCheckoutItem']['_returnType']> & {
          offers: Api['offers']['getAcceptedOffersForEventProduct']['_returnType'];
        })[];
      }
    >;
    syncOfflineSales: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        sales: {
          deskSaleId: string;
          soldAt: number;
          buyerEmail?: string | undefined;
          /** How the desk sold: it took only the commission. Booked that way */
          directSale?: boolean | undefined;
          autoReturn?: boolean | undefined;
          items: {
            eventProductId: Id<'eventProducts'>;
            productId: Id<'products'>;
            title: string;
            paid: number;
            priceSource: 'list' | 'offer' | 'negotiated';
            offerId?: Id<'productOffers'> | undefined;
          }[];
        }[];
      },
      {
        deskSaleId: string;
        bookedNow: boolean;
        purchaseIds: Id<'purchase'>[];
        conflicts: Id<'products'>[];
      }[]
    >;
    getSaleConflicts: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      {
        _id: string;
        productId?: Id<'products'>;
        title: string;
        amount: number;
        reason: string;
        soldAt: number;
        cashier?: string;
        resolvedAt?: number;
      }[]
    >;
    resolveSaleConflict: FunctionReference<
      'mutation',
      { conflictId: string },
      { success: boolean }
    >;
    undoSale: FunctionReference<
      'mutation',
      { eventProductId: Id<'eventProducts'> },
      { success: boolean }
    >;
    getPurchasesForEvent: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      {
        _id: Id<'purchase'>;
        _creationTime: number;
        discountPercent?: number | undefined;
        listPrice?: number | undefined;
        priceSource?: 'list' | 'offer' | 'negotiated' | undefined;
        offerId?: Id<'productOffers'> | undefined;
        event: Id<'events'>;
        /** Missing once the product is deleted; the sale keeps title and category */
        product?: Id<'products'> | undefined;
        seller: Id<'users'>;
        totalAmount: number;
        comissionAmount: number;
        payoutAmount: number;
        payoutStatus: boolean;
        payoutDate: number;
        productTitle?: string | undefined;
        categoryId?: Id<'categories'> | undefined;
        categoryLabel?: string | undefined;
        productAttributes?: Record<string, string> | undefined;
        sellerNumber?: number | undefined;
      }[]
    >;
    getMySales: FunctionReference<
      'query',
      EmptyObject,
      {
        event: {
          _id: Id<'events'>;
          title: string;
          startDate: number;
          endDate: number;
          /** The seller's commission: their fee group's or the bazaar's */
          commissionPercent: number;
          /** The seller's fee group (#302) */
          feeGroup?: string | undefined;
        };
        paid: boolean;
        sellerNumber: number | undefined;
        items: {
          purchaseId: Id<'purchase'>;
          productId?: Id<'products'> | undefined;
          title: string;
          description: string;
          images: Id<'_storage'>[];
          sale: SaleInfo;
        }[];
        totals: {
          revenue: number;
          commission: number;
          intakeFee: IntakeFee;
          /** Fees above the cap given back */
          feeCapCredit: number;
          payout: number;
        };
      }[]
    >;
  };
  sellerNumbers: {
    assignMissingSellerNumbers: FunctionReference<'mutation', { eventId: Id<'events'> }, number>;
    getMySellerNumber: FunctionReference<'query', { eventId: Id<'events'> }, number | null>;
  };
  sellerRecords: {
    getProofOfOffers: FunctionReference<
      'query',
      { eventId: Id<'events'> },
      {
        event: { title: string; location: string; startDate: number; endDate: number };
        items: ProofItem[];
      }
    >;
  };
  settlement: {
    getExport: FunctionReference<'query', { eventId: Id<'events'> }, SettlementExport>;
  };
  sitePages: {
    get: FunctionReference<
      'query',
      { slug: 'imprint' | 'privacy' | 'terms' },
      { title: string; markdown: string; version: number; updatedAt: number } | null
    >;
    listForAdmin: FunctionReference<
      'query',
      EmptyObject,
      {
        slug: 'imprint' | 'privacy' | 'terms';
        title: string | undefined;
        markdown: string | undefined;
        version: number | undefined;
        updatedAt: number | undefined;
        updatedByName: string | undefined;
        hasPlaceholders: boolean;
      }[]
    >;
    save: FunctionReference<
      'mutation',
      { title: string; slug: 'imprint' | 'privacy' | 'terms'; markdown: string },
      number
    >;
  };
  users: {
    viewer: FunctionReference<
      'query',
      EmptyObject,
      {
        _id: Id<'users'>;
        _creationTime: number;
        name?: string | undefined;
        image?: string | undefined;
        email?: string | undefined;
        emailVerificationTime?: number | undefined;
        phone?: string | undefined;
        phoneVerificationTime?: number | undefined;
        isAnonymous?: boolean | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        street?: string | undefined;
        city?: string | undefined;
        zipCode?: string | undefined;
        country?: string | undefined;
        verificationToken?: string | undefined;
        isMailConfirmed?: boolean | undefined;
        status?: 'notVerified' | 'active' | 'inactive' | 'deleted' | 'banned' | undefined;
        lastLoginAt?: number | undefined;
        systemRole?: 'admin' | 'user' | undefined;
        needsOnboarding?: boolean | undefined;
        checkInToken?: string | undefined;
        checkInTokenExpires?: number | undefined;
        managedByEventId?: Id<'events'> | undefined;
        contactEmail?: string | undefined;
        notificationPrefs?:
          | {
              offers?: boolean | undefined;
              reminders?: boolean | undefined;
              sales?: boolean | undefined;
              questions?: boolean | undefined;
              buyer?: boolean | undefined;
              organizer?: boolean | undefined;
            }
          | undefined;
        unsubscribeToken?: string | undefined;
        locale?: 'de' | 'en' | undefined;
      } | null
    >;
    getUserSystemRole: FunctionReference<'query', { userId: Id<'users'> }, 'admin' | 'user' | null>;
    getUserProviders: FunctionReference<'query', EmptyObject, string[]>;
    markOnboardingSeen: FunctionReference<'mutation', EmptyObject, null>;
    getUserById: FunctionReference<
      'query',
      { eventId?: Id<'events'> | undefined; userId: Id<'users'> },
      {
        _id: Id<'users'>;
        _creationTime: number;
        name?: string | undefined;
        image?: string | undefined;
        email?: string | undefined;
        emailVerificationTime?: number | undefined;
        phone?: string | undefined;
        phoneVerificationTime?: number | undefined;
        isAnonymous?: boolean | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        street?: string | undefined;
        city?: string | undefined;
        zipCode?: string | undefined;
        country?: string | undefined;
        verificationToken?: string | undefined;
        isMailConfirmed?: boolean | undefined;
        status?: 'notVerified' | 'active' | 'inactive' | 'deleted' | 'banned' | undefined;
        lastLoginAt?: number | undefined;
        systemRole?: 'admin' | 'user' | undefined;
        needsOnboarding?: boolean | undefined;
        checkInToken?: string | undefined;
        checkInTokenExpires?: number | undefined;
        managedByEventId?: Id<'events'> | undefined;
        contactEmail?: string | undefined;
        notificationPrefs?:
          | {
              offers?: boolean | undefined;
              reminders?: boolean | undefined;
              sales?: boolean | undefined;
              questions?: boolean | undefined;
              buyer?: boolean | undefined;
              organizer?: boolean | undefined;
            }
          | undefined;
        unsubscribeToken?: string | undefined;
        locale?: 'de' | 'en' | undefined;
      } | null
    >;
    update: FunctionReference<
      'mutation',
      {
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        street?: string | undefined;
        city?: string | undefined;
        zipCode?: string | undefined;
        country?: string | undefined;
        status?: 'notVerified' | 'active' | 'inactive' | 'deleted' | 'banned' | undefined;
      },
      null
    >;
    isMyProfileFixed: FunctionReference<'query', EmptyObject, boolean>;
    /** A bazaar for its region (#304) let the user in by postal code and country */
    isMyPostalCodeFixed: FunctionReference<'query', EmptyObject, boolean>;
    getMissinfProfileData: FunctionReference<'query', { userId: Id<'users'> }, string[]>;
    setDeleted: FunctionReference<
      'mutation',
      { immediately?: boolean | undefined; settlementExported?: boolean | undefined },
      null
    >;
    getAccountDeletionInfo: FunctionReference<
      'query',
      { userId?: Id<'users'> | undefined },
      {
        graceDays: number;
        pastOrganizedEvents: {
          _id: Id<'events'>;
          title: string;
          endDate: number;
          coOrganizers: { _id: Id<'users'>; name: string | null }[];
        }[];
      }
    >;
    deleteUserForAdmin: FunctionReference<
      'mutation',
      { userId: Id<'users'>; settlementExported?: boolean | undefined },
      { ok: boolean }
    >;
    generateCheckInToken: FunctionReference<
      'mutation',
      EmptyObject,
      { token: string; expires: number }
    >;
    getUserByCheckInToken: FunctionReference<
      'query',
      { eventId: Id<'events'>; token: string },
      {
        _id: Id<'users'>;
        _creationTime: number;
        name?: string | undefined;
        image?: string | undefined;
        email?: string | undefined;
        emailVerificationTime?: number | undefined;
        phone?: string | undefined;
        phoneVerificationTime?: number | undefined;
        isAnonymous?: boolean | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        street?: string | undefined;
        city?: string | undefined;
        zipCode?: string | undefined;
        country?: string | undefined;
        verificationToken?: string | undefined;
        isMailConfirmed?: boolean | undefined;
        status?: 'notVerified' | 'active' | 'inactive' | 'deleted' | 'banned' | undefined;
        lastLoginAt?: number | undefined;
        systemRole?: 'admin' | 'user' | undefined;
        needsOnboarding?: boolean | undefined;
        checkInToken?: string | undefined;
        checkInTokenExpires?: number | undefined;
        managedByEventId?: Id<'events'> | undefined;
        contactEmail?: string | undefined;
        notificationPrefs?:
          | {
              offers?: boolean | undefined;
              reminders?: boolean | undefined;
              sales?: boolean | undefined;
              questions?: boolean | undefined;
              buyer?: boolean | undefined;
              organizer?: boolean | undefined;
            }
          | undefined;
        unsubscribeToken?: string | undefined;
        locale?: 'de' | 'en' | undefined;
      } | null
    >;
    getExportData: FunctionReference<
      'query',
      EmptyObject,
      {
        profile: {
          name: string | undefined;
          email: string | undefined;
          phone: string | undefined;
          firstName: string | undefined;
          lastName: string | undefined;
          street: string | undefined;
          city: string | undefined;
          zipCode: string | undefined;
          country: string | undefined;
          createdAt: number;
        };
        products: {
          title: string;
          description: string;
          price: number;
          condition: 'new' | 'very-good' | 'good' | 'ok';
          createdAt: number;
        }[];
        organizedEvents: {
          title: string;
          description: string;
          location: string;
          street?: string | undefined;
          postalCode?: string | undefined;
          city?: string | undefined;
          country?: string | undefined;
          startDate: number;
          endDate: number;
          createdAt: number;
        }[];
        sales: {
          event: string;
          title?: string | undefined;
          totalAmount: number;
          commissionAmount: number;
          payoutAmount: number;
          soldAt: number;
        }[];
        sellerParticipations: {
          event: string;
          sellerNumber?: number | undefined;
          payoutReceived: boolean;
          payoutAmount: number;
          intakeFee?: number | undefined;
          privateSellerConfirmedAt?: number | undefined;
          recordedDetails?: Record<string, string | number> | undefined;
        }[];
        offers: {
          event: string;
          product: string;
          amount: number;
          message?: string | undefined;
          status: string;
          createdAt: number;
        }[];
        questions: {
          event: string;
          product: string;
          question: string;
          answer?: string | undefined;
          createdAt: number;
        }[];
        eventRoles: { event: string; role: string; createdAt: number }[];
        exportDate: string;
      }
    >;
    getE2eVerificationCode: FunctionReference<'query', { email: string }, string>;
    confirmEmailForE2E: FunctionReference<'mutation', { email: string }, { ok: boolean }>;
    setProfileForE2E: FunctionReference<
      'mutation',
      {
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        street?: string | undefined;
        city?: string | undefined;
        zipCode?: string | undefined;
        country?: string | undefined;
        email: string;
      },
      { ok: boolean }
    >;
    listUsersForAdmin: FunctionReference<
      'query',
      EmptyObject,
      {
        _id: Id<'users'>;
        _creationTime: number;
        name: string | undefined;
        email: string | undefined;
        phone: string | undefined;
        status: 'notVerified' | 'active' | 'inactive' | 'deleted' | 'banned' | undefined;
        systemRole: 'admin' | 'user' | undefined;
        lastLoginAt: number | undefined;
        isWalkIn: boolean;
      }[]
    >;
    setUserStatusForAdmin: FunctionReference<
      'mutation',
      {
        status: 'notVerified' | 'active' | 'inactive' | 'deleted' | 'banned';
        userId: Id<'users'>;
      },
      { ok: boolean }
    >;
    setMyLocale: FunctionReference<'mutation', { locale: 'de' | 'en' }, null>;
  };
  walkInSellers: {
    createWalkInSeller: FunctionReference<
      'mutation',
      {
        phone?: string | undefined;
        contactEmail?: string | undefined;
        firstName: string;
        lastName: string;
        eventId: Id<'events'>;
      },
      Id<'users'>
    >;
    saveWalkInProduct: FunctionReference<
      'mutation',
      {
        images?: Id<'_storage'>[] | undefined;
        attributes?: Record<string, string> | undefined;
        acceptsOffers?: boolean | undefined;
        minimumPrice?: number | undefined;
        productId?: Id<'products'> | undefined;
        title: string;
        description: string;
        condition: 'new' | 'very-good' | 'good' | 'ok';
        productCategory: Id<'categories'>;
        price: number;
        eventId: Id<'events'>;
        sellerId: Id<'users'>;
      },
      Id<'products'>
    >;
    deleteWalkInProduct: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        productId: Id<'products'>;
      },
      null
    >;
  };
}

// Helpers for the hooks, in the shape of convex/server

export type AnyFunction = FunctionReference<'query' | 'mutation', any, any>;
export type FunctionArgs<F extends AnyFunction> = F['_args'];
export type FunctionReturnType<F extends AnyFunction> = F['_returnType'];
/** Arguments of a call: optional when the function takes none. */
export type OptionalRestArgs<F extends AnyFunction> = F['_args'] extends EmptyObject
  ? [args?: F['_args']]
  : [args: F['_args']];
/** Like OptionalRestArgs, or "skip" to not run a query. */
export type OptionalRestArgsOrSkip<F extends AnyFunction> = F['_args'] extends EmptyObject
  ? [args?: F['_args'] | 'skip']
  : [args: F['_args'] | 'skip'];
