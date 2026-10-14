import { ConvexError, v } from 'convex/values';
import { mutation, query, type DatabaseReader } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireAdmin } from './adminAuth';
import { EMAIL_PATTERN, INSTANCE_MODES, type InstanceMode } from './constants';

const MAX_NAME_LENGTH = 80;

/**
 * Mode of this installation, set once per deployment (`BAZARPRO_MODE`, passed to
 * Convex by scripts/selfhost/init.mjs). Unknown or missing values mean `platform`,
 * so bazarpro.de needs no configuration.
 */
export function getInstanceMode(): InstanceMode {
  const value = process.env.BAZARPRO_MODE;
  return (INSTANCE_MODES as readonly string[]).includes(value ?? '')
    ? (value as InstanceMode)
    : 'platform';
}

export async function getSiteSettings(ctx: {
  db: DatabaseReader;
}): Promise<Doc<'siteSettings'> | null> {
  return await ctx.db.query('siteSettings').first();
}

/** Public: what every page needs to know about this instance (mode, name, logo). */
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const settings = await getSiteSettings(ctx);
    return {
      mode: getInstanceMode(),
      name: settings?.name,
      contactEmail: settings?.contactEmail,
      logoUrl: settings?.logo ? await ctx.storage.getUrl(settings.logo) : null,
    };
  },
});

/** Admins: name, contact address and logo of the instance. */
export const updateSettings = mutation({
  args: {
    name: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    /** null removes the logo, undefined keeps it */
    logo: v.optional(v.union(v.id('_storage'), v.null())),
  },
  handler: async (ctx, args) => {
    const adminId = await requireAdmin(ctx);
    const name = args.name?.trim() || undefined;
    if (name && name.length > MAX_NAME_LENGTH) {
      throw new ConvexError(`Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen haben.`);
    }
    const contactEmail = args.contactEmail?.trim() || undefined;
    if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
      throw new ConvexError('Bitte gib eine gültige E-Mail-Adresse ein.');
    }

    const existing = await getSiteSettings(ctx);
    const logo = args.logo === undefined ? existing?.logo : (args.logo ?? undefined);
    if (existing?.logo && existing.logo !== logo) {
      await ctx.storage.delete(existing.logo);
    }
    const values = { name, contactEmail, logo, updatedAt: Date.now(), updatedBy: adminId };
    if (existing) {
      await ctx.db.replace(existing._id, values);
    } else {
      await ctx.db.insert('siteSettings', values);
    }
  },
});
