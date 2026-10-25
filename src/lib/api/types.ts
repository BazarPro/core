/**
 * Types of the backend functions and documents, the contract between app and backend
 * (backend/src/modules). Generated once from the former Convex definitions; keep it in
 * step with the Rust structs when a function changes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type TableName =
  | '_storage'
  | 'categories'
  | 'contactMessages'
  | 'eventBroadcasts'
  | 'eventLocationCategories'
  | 'eventProducts'
  | 'eventRole'
  | 'eventSeller'
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
    isApproved?: boolean | undefined;
    approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
    approvedAt?: number | undefined;
    approvedBy?: Id<'users'> | undefined;
    rejectedAt?: number | undefined;
    rejectedBy?: Id<'users'> | undefined;
    rejectionReason?: string | undefined;
    accessCode?: string | undefined;
    vendorLimit?: number | undefined;
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
          requiredFields?: string[] | undefined;
          maxItemsPerSeller?: number | undefined;
          labelFormat?: 'small' | 'standard' | undefined;
          priceOnLabel?: boolean | undefined;
          intakeFee?: number | undefined;
          privateSellersOnly?: boolean | undefined;
          fixedSellerData?: boolean | undefined;
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
    startDate: number;
    endDate: number;
    contactInfo: string;
    services: ('Parkplatz' | 'Skiservice' | 'Gastronomie' | 'Imbiss' | 'Getränke')[];
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
    status: 'sold' | 'announced' | 'available' | 'returned';
    eventId: Id<'events'>;
    productId: Id<'products'>;
  };
  categories: {
    _id: Id<'categories'>;
    _creationTime: number;
    parentCategory?: Id<'categories'> | undefined;
    updatedAt: number;
    label: string;
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
    audience: 'pickup' | 'all' | 'accepted';
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
  audience?: 'pickup' | 'all' | 'accepted' | undefined;
  recipientCount?: number | undefined;
  subject: string;
  body: string;
  important: boolean;
  createdAt: number;
  _id: Id<'eventBroadcasts'>;
};

export type CategoryFieldText =
  | 'brand'
  | 'frameNumber'
  | 'frameSize'
  | 'wheelSize'
  | 'bikeBrand'
  | 'clothingSize'
  | 'shoeSize'
  | 'sportSize'
  | 'model';

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
  requiredFields?: string[] | undefined;
  maxItemsPerSeller?: number | undefined;
  labelFormat: 'small' | 'standard';
  priceOnLabel: boolean;
  intakeFee?: number | undefined;
  privateSellersOnly: boolean;
  fixedSellerData: boolean;
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
  attributes: { label: string; text: CategoryFieldText; value: string }[];
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
  /** Negative when the seller owes the bazaar */
  payout: number;
  paid: boolean;
};

export type SaleInfo = {
  listPrice: number;
  discountPercent?: number | undefined;
  priceSource: 'list' | 'offer' | 'negotiated';
  totalAmount: number;
  commission: number;
  payout: number;
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
  payout: number;
  paid: boolean;
  grossRevenue: number;
  totalDiscount: number;
  isHelper: boolean;
  sellerNumber?: number | undefined;
  /** Bazaars with fixedSellerData: name and address are recorded (first item accepted) */
  detailsRecorded?: boolean | undefined;
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
      { eventId: Id<'events'>; audience: 'pickup' | 'all' | 'accepted' },
      { recipients: number; left: number; importantLeft: number }
    >;
    sendSellerBroadcast: FunctionReference<
      'mutation',
      {
        eventId: Id<'events'>;
        subject: string;
        body: string;
        audience: 'pickup' | 'all' | 'accepted';
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
      { parentCategory?: Id<'categories'> | undefined; label: string },
      Id<'categories'>
    >;
    getAllCategories: FunctionReference<
      'query',
      EmptyObject,
      {
        _id: Id<'categories'>;
        _creationTime: number;
        parentCategory?: Id<'categories'> | undefined;
        updatedAt: number;
        label: string;
      }[]
    >;
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
        status: 'sold' | 'announced' | 'available' | 'returned';
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
        status: 'sold' | 'announced' | 'available' | 'returned';
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
        status: 'sold' | 'announced' | 'available' | 'returned';
        discountPercent: number | undefined;
        locationCategoryId: Id<'eventLocationCategories'> | undefined;
        locationLabel: string | undefined;
        internalNote: string | undefined;
        sale: SaleInfo | undefined;
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
        status: 'sold' | 'announced' | 'available' | 'returned';
        eventId: Id<'events'>;
        productId: Id<'products'>;
      } | null
    >;
    setEventProductNote: FunctionReference<
      'mutation',
      { note: string; eventProductId: Id<'eventProducts'> },
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
        status: 'sold' | 'announced' | 'available' | 'returned';
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
      { vendorId: Id<'users'>; eventId: Id<'events'> },
      { updatedCount: number }
    >;
    markAllVendorProductsReturned: FunctionReference<
      'mutation',
      { vendorId: Id<'users'>; eventId: Id<'events'> },
      { updatedCount: number }
    >;
    undoReturn: FunctionReference<
      'mutation',
      { eventProductId: Id<'eventProducts'> },
      { success: boolean }
    >;
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
    getMyRolesForEvents: FunctionReference<
      'query',
      { eventIds: Id<'events'>[] },
      { eventId: Id<'events'>; roles: ('organizer' | 'seller' | 'coorganizer')[] }[]
    >;
    addCoOrganizerForEvent: FunctionReference<
      'mutation',
      { eventId: Id<'events'>; userId: Id<'users'> },
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
  eventSeller: {
    joinEvent: FunctionReference<
      'mutation',
      {
        accessCode?: string | undefined;
        privateSeller?: boolean | undefined;
        eventId: Id<'events'>;
      },
      Id<'eventSeller'>
    >;
    removeSellerAndCoorganizerRoles: FunctionReference<'mutation', EmptyObject, false | null>;
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
  events: {
    getFeeLock: FunctionReference<'query', { eventId: Id<'events'> }, { locked: boolean } | null>;
    getMyEvents: FunctionReference<
      'query',
      { includePast?: boolean | undefined },
      {
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
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
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              intakeFee?: number | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
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
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: ('Parkplatz' | 'Skiservice' | 'Gastronomie' | 'Imbiss' | 'Getränke')[];
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
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
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
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              intakeFee?: number | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
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
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: ('Parkplatz' | 'Skiservice' | 'Gastronomie' | 'Imbiss' | 'Getränke')[];
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
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
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
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              intakeFee?: number | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
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
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: ('Parkplatz' | 'Skiservice' | 'Gastronomie' | 'Imbiss' | 'Getränke')[];
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
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
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
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              intakeFee?: number | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
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
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: ('Parkplatz' | 'Skiservice' | 'Gastronomie' | 'Imbiss' | 'Getränke')[];
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
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
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
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              intakeFee?: number | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
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
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: ('Parkplatz' | 'Skiservice' | 'Gastronomie' | 'Imbiss' | 'Getränke')[];
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
        _id: Id<'events'>;
        _creationTime: number;
        moderation?: { hiddenAt: number; hiddenBy: Id<'users'>; reason: string } | undefined;
        coverImage?: Id<'_storage'> | undefined;
        eventMapImage?: Id<'_storage'> | undefined;
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
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
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              intakeFee?: number | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
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
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: ('Parkplatz' | 'Skiservice' | 'Gastronomie' | 'Imbiss' | 'Getränke')[];
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
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
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
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              intakeFee?: number | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
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
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: ('Parkplatz' | 'Skiservice' | 'Gastronomie' | 'Imbiss' | 'Getränke')[];
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
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
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
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              intakeFee?: number | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
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
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
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
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              intakeFee?: number | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
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
        clearCoverImage?: boolean | undefined;
        clearEventMapImage?: boolean | undefined;
        categories: Id<'categories'>[];
        id: Id<'events'>;
        title: string;
        description: string;
        location: string;
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: string[];
        visibility: string;
        commission: number;
      },
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
        isApproved?: boolean | undefined;
        approvalStatus?: 'approved' | 'pending' | 'rejected' | undefined;
        approvedAt?: number | undefined;
        approvedBy?: Id<'users'> | undefined;
        rejectedAt?: number | undefined;
        rejectedBy?: Id<'users'> | undefined;
        rejectionReason?: string | undefined;
        accessCode?: string | undefined;
        vendorLimit?: number | undefined;
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
              requiredFields?: string[] | undefined;
              maxItemsPerSeller?: number | undefined;
              labelFormat?: 'small' | 'standard' | undefined;
              priceOnLabel?: boolean | undefined;
              intakeFee?: number | undefined;
              privateSellersOnly?: boolean | undefined;
              fixedSellerData?: boolean | undefined;
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
        startDate: number;
        endDate: number;
        contactInfo: string;
        services: ('Parkplatz' | 'Skiservice' | 'Gastronomie' | 'Imbiss' | 'Getränke')[];
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
        totalPayoutSoll: number;
        totalPaidOut: number;
        totalPendingPayout: number;
        totalIntakeFees: number;
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
    getLabelData: FunctionReference<
      'query',
      { eventId?: Id<'events'> | undefined; productIds: Id<'products'>[] },
      {
        format: 'small' | 'standard';
        labels: {
          productId: Id<'products'>;
          title: string;
          sellerNumber: number | undefined;
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
      },
      {
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
      }[]
    >;
    listQuestions: FunctionReference<
      'query',
      { search?: string | undefined; askerId?: Id<'users'> | undefined },
      {
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
      }[]
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
      { events: number; messages: number; products: number; sales: number }
    >;
    markNoticesSeen: FunctionReference<
      'mutation',
      { eventId?: Id<'events'> | undefined; area: 'events' | 'messages' | 'products' | 'sales' },
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
        errorMessage: string;
        doneAt: number;
        userName?: string;
        resolvedAt?: number;
      }[]
    >;
    resolveFailedAction: FunctionReference<'mutation', { actionId: string }, { success: boolean }>;
    ensureCheckInSecret: FunctionReference<
      'mutation',
      Record<string, never>,
      { userId: string; keys: { eventId: Id<'events'>; secret: string }[] }
    >;
    getCheckInSecretsForEvent: FunctionReference<
      'mutation',
      { eventId: Id<'events'> },
      { userId: string; secret: string }[]
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
    get: FunctionReference<
      'query',
      EmptyObject,
      Omit<
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
      >[]
    >;
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
          attributeList: { label: string; value: string }[];
          activeListing: {
            eventId: Id<'events'>;
            eventProductId: Id<'eventProducts'>;
            eventTitle: string;
            features: EventFeatures;
            status: string;
            startDate: number;
            endDate: number;
          } | null;
          isNegotiable: boolean;
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
      { purchaseIds: Id<'purchase'>[]; total: number }
    >;
    getCheckoutItem: FunctionReference<
      'query',
      { eventId: Id<'events'>; productId: string },
      {
        eventProductId: Id<'eventProducts'>;
        productId: Id<'products'>;
        title: string;
        image: Id<'_storage'>;
        status: 'sold' | 'announced' | 'available' | 'returned';
        price: number;
        discountPercent: number | undefined;
        listPrice: number;
        minimumPrice: number | undefined;
        sellerPaidOut: boolean;
        attributes: { label: string; text: CategoryFieldText; value: string }[];
        internalNote?: string;
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
          commissionPercent: number;
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
        totals: { revenue: number; commission: number; intakeFee: IntakeFee; payout: number };
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
