import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireAdmin } from './adminAuth';
import { PLACEHOLDER_PATTERN, SITE_PAGE_SLUGS } from './constants';
import { appError } from './errors';

const MAX_TITLE_LENGTH = 120;
const MAX_MARKDOWN_LENGTH = 100_000;
const slugValidator = v.union(...SITE_PAGE_SLUGS.map(v.literal));

/** Public: the current text of a legal page, or null if admins have not saved one yet. */
export const get = query({
  args: { slug: slugValidator },
  handler: async (ctx, { slug }) => {
    const page = await ctx.db
      .query('sitePages')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!page) return null;
    return {
      title: page.title,
      markdown: page.markdown,
      version: page.version,
      updatedAt: page.updatedAt,
    };
  },
});

/** Admins: state of every legal page for the editor and the dashboard warning. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await Promise.all(
      SITE_PAGE_SLUGS.map(async (slug) => {
        const page = await ctx.db
          .query('sitePages')
          .withIndex('by_slug', (q) => q.eq('slug', slug))
          .unique();
        const editor = page ? await ctx.db.get(page.updatedBy) : null;
        return {
          slug,
          title: page?.title,
          markdown: page?.markdown,
          version: page?.version,
          updatedAt: page?.updatedAt,
          updatedByName: editor?.name,
          hasPlaceholders: page ? PLACEHOLDER_PATTERN.test(page.markdown) : false,
        };
      })
    );
  },
});

/** Admins: saves a new version of a legal page. Older versions are kept. */
export const save = mutation({
  args: { slug: slugValidator, title: v.string(), markdown: v.string() },
  handler: async (ctx, args) => {
    const adminId = await requireAdmin(ctx);
    const title = args.title.trim();
    const markdown = args.markdown.trim();
    if (title.length < 3 || title.length > MAX_TITLE_LENGTH) {
      throw appError('profile.titleLength', { max: MAX_TITLE_LENGTH });
    }
    if (!markdown) throw appError('pages.empty');
    if (markdown.length > MAX_MARKDOWN_LENGTH) {
      throw appError('pages.tooLong');
    }

    const existing = await ctx.db
      .query('sitePages')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();
    if (existing && existing.title === title && existing.markdown === markdown) {
      return existing.version;
    }
    const now = Date.now();
    const version = (existing?.version ?? 0) + 1;
    const values = {
      slug: args.slug,
      title,
      markdown,
      version,
      updatedAt: now,
      updatedBy: adminId,
    };
    if (existing) await ctx.db.replace(existing._id, values);
    else await ctx.db.insert('sitePages', values);
    await ctx.db.insert('sitePageVersions', {
      slug: args.slug,
      version,
      title,
      markdown,
      createdAt: now,
      createdBy: adminId,
    });
    return version;
  },
});
