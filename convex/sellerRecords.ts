import type { Doc, Id } from './_generated/dataModel';
import { query, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { describeAttributes, getCategoryFields, type CategoryFieldText } from './categoryFields';
import { resolveEventFeatures } from './eventFeatures';
import { appError } from './errors';

/**
 * Who offered what at a bazaar with fixed seller data (feature fixedSellerData), e.g.
 * the list for the police at a bike market: the seller's details are copied to the
 * seller row at the first registered item and stay fixed from then on.
 */

/** Profile fields a seller needs before joining a bazaar. */
export const SELLER_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'street',
  'city',
  'zipCode',
  'country',
] as const satisfies readonly (keyof Doc<'users'>)[];

/** Fields that stay fixed while a record of the seller is needed. */
export const FIXED_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'street',
  'zipCode',
  'city',
  'country',
] as const satisfies readonly (keyof Doc<'users'>)[];

export function missingProfileFields(user: Doc<'users'>) {
  return SELLER_PROFILE_FIELDS.filter((field) => {
    const value = user[field];
    return typeof value !== 'string' || value.trim() === '';
  });
}

export function keepsSellerRecord(event: Doc<'events'>): boolean {
  return resolveEventFeatures(event).fixedSellerData;
}

/** Copies the seller's details to the seller row once, at the first registered item. */
export async function recordSellerDetails(
  ctx: MutationCtx,
  event: Doc<'events'>,
  userId: Id<'users'>
) {
  if (!keepsSellerRecord(event)) return;
  const row = await ctx.db
    .query('eventSeller')
    .withIndex('by_event_user', (q) => q.eq('event', event._id).eq('user', userId))
    .first();
  if (!row || row.sellerSnapshot) return;
  const user = await ctx.db.get(userId);
  if (!user) return;
  await ctx.db.patch(row._id, {
    sellerSnapshot: {
      firstName: user.firstName,
      lastName: user.lastName,
      street: user.street,
      zipCode: user.zipCode,
      city: user.city,
      country: user.country,
      phone: user.phone,
      email: user.email ?? user.contactEmail,
      takenAt: Date.now(),
    },
  });
}

/** Whether name and address of the user are fixed: a bazaar keeping their record is not over. */
export async function isProfileFixed(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>
): Promise<boolean> {
  const rows = await ctx.db
    .query('eventSeller')
    .withIndex('by_user', (q) => q.eq('user', userId))
    .collect();
  const now = Date.now();
  for (const row of rows) {
    if (!row.sellerSnapshot) continue;
    const event = await ctx.db.get(row.event);
    if (event && keepsSellerRecord(event) && event.endDate >= now) return true;
  }
  return false;
}

/**
 * Whether title, category, price and required fields of the item are fixed: it is
 * registered for a bazaar that keeps a record and is not over. `fieldKeys` are the
 * required fields of those bazaars.
 */
export async function fixedItemData(
  ctx: QueryCtx | MutationCtx,
  productId: Id<'products'>
): Promise<{ fixed: boolean; fieldKeys: string[] }> {
  const relations = await ctx.db
    .query('eventProducts')
    .withIndex('by_productId', (q) => q.eq('productId', productId))
    .collect();
  const now = Date.now();
  const fieldKeys = new Set<string>();
  let fixed = false;
  for (const relation of relations) {
    const event = await ctx.db.get(relation.eventId);
    if (!event || !keepsSellerRecord(event) || event.endDate < now) continue;
    fixed = true;
    resolveEventFeatures(event).requiredFields?.forEach((key) => fieldKeys.add(key));
  }
  return { fixed, fieldKeys: [...fieldKeys] };
}

/** Rejects a change of fixed item data, see fixedItemData. */
export async function assertItemDataUnchanged(
  ctx: MutationCtx,
  product: Doc<'products'>,
  next: {
    title?: string;
    productCategory?: Id<'categories'>;
    price?: number;
    attributes?: Record<string, string>;
  }
) {
  const { fixed, fieldKeys } = await fixedItemData(ctx, product._id);
  if (!fixed) return;
  const changed =
    (next.title !== undefined && next.title !== product.title) ||
    (next.productCategory !== undefined && next.productCategory !== product.productCategory) ||
    (next.price !== undefined && next.price !== product.price) ||
    (next.attributes !== undefined &&
      fieldKeys.some(
        (key) =>
          product.attributes?.[key] && next.attributes?.[key]?.trim() !== product.attributes[key]
      ));
  if (changed) throw appError('product.dataFixed');
}

export interface ProofSeller {
  sellerNumber?: number;
  firstName?: string;
  lastName?: string;
  street?: string;
  zipCode?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  /** When the seller confirmed to sell privately (feature privateSellersOnly) */
  privateSellerConfirmedAt?: number;
  /** The details are the copy from the first registered item, not today's profile */
  fromRecord: boolean;
}

export interface ProofItem {
  productId: Id<'products'>;
  title: string;
  category: string;
  attributes: { label: string; text: CategoryFieldText; value: string }[];
  price: number;
  status: string;
  soldFor?: number;
  soldAt?: number;
  seller: ProofSeller;
}

/**
 * Who offered which item at the bazaar, e.g. for the police after a bike market: every
 * registered item with the seller's recorded details and the sale. Event team only.
 */
export const getProofOfOffers = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');
    if (!(await hasAnyEventRoleOrAdmin(ctx, eventId, userId, ['organizer', 'coorganizer']))) {
      throw appError('auth.forbidden');
    }
    const event = await ctx.db.get(eventId);
    if (!event) throw appError('notFound.event');

    const [relations, sellerRows, purchases, categories] = await Promise.all([
      ctx.db
        .query('eventProducts')
        .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
        .collect(),
      ctx.db
        .query('eventSeller')
        .withIndex('by_event_user', (q) => q.eq('event', eventId))
        .collect(),
      ctx.db
        .query('purchase')
        .withIndex('by_event_seller', (q) => q.eq('event', eventId))
        .collect(),
      ctx.db.query('categories').collect(),
    ]);
    const rowByUser = new Map(sellerRows.map((row) => [row.user as string, row]));
    const purchaseByProduct = new Map(purchases.map((p) => [p.product as string, p]));
    const sellers = new Map<string, ProofSeller>();

    const sellerFor = async (vendorId: Id<'users'>): Promise<ProofSeller> => {
      const cached = sellers.get(vendorId);
      if (cached) return cached;
      const row = rowByUser.get(vendorId);
      const user = await ctx.db.get(vendorId);
      const details = row?.sellerSnapshot ?? {
        firstName: user?.firstName,
        lastName: user?.lastName,
        street: user?.street,
        zipCode: user?.zipCode,
        city: user?.city,
        country: user?.country,
        phone: user?.phone,
        email: user?.email ?? user?.contactEmail,
      };
      const seller: ProofSeller = {
        sellerNumber: row?.number,
        firstName: details.firstName ?? user?.name,
        lastName: details.lastName,
        street: details.street,
        zipCode: details.zipCode,
        city: details.city,
        country: details.country,
        phone: details.phone,
        email: details.email,
        privateSellerConfirmedAt: row?.privateSellerConfirmedAt,
        fromRecord: !!row?.sellerSnapshot,
      };
      sellers.set(vendorId, seller);
      return seller;
    };

    const items: ProofItem[] = [];
    for (const relation of relations) {
      const product = await ctx.db.get(relation.productId);
      if (!product) continue;
      const purchase = purchaseByProduct.get(product._id);
      items.push({
        productId: product._id,
        title: product.title,
        category: categories.find((c) => c._id === product.productCategory)?.label ?? '',
        attributes: describeAttributes(
          getCategoryFields(product.productCategory, categories),
          product.attributes
        ),
        price: product.price,
        status: relation.status,
        soldFor: purchase?.totalAmount,
        soldAt: purchase?._creationTime,
        seller: await sellerFor(product.vendorId),
      });
    }
    items.sort(
      (a, b) =>
        (a.seller.sellerNumber ?? Infinity) - (b.seller.sellerNumber ?? Infinity) ||
        a.title.localeCompare(b.title)
    );
    return {
      event: {
        title: event.title,
        location: event.location,
        startDate: event.startDate,
        endDate: event.endDate,
      },
      items,
    };
  },
});
