import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
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
