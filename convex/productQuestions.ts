import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { findActiveEventListing } from './eventProducts';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { resolveEventFeatures } from './eventFeatures';
import { canActForSeller } from './offers';
import { displayName, notifyUser } from './notifications';

const MAX_QUESTION_LENGTH = 500;
const MAX_ANSWER_LENGTH = 1000;
/** Keeps a single account from flooding an item with questions. */
const MAX_OPEN_QUESTIONS_PER_USER = 3;

/** Public questions and answers of an item, oldest first. */
export const listForProduct = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx);
    const product = await ctx.db.get(productId);
    if (!product) return [];
    const canAnswer = userId ? await canActForSeller(ctx, product, userId) : false;

    const questions = await ctx.db
      .query('productQuestions')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect();

    return await Promise.all(
      questions
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (question) => ({
          _id: question._id,
          question: question.question,
          answer: question.answer,
          createdAt: question.createdAt,
          answeredAt: question.answeredAt,
          askerName: displayName(await ctx.db.get(question.askerId)),
          isMine: question.askerId === userId,
          canAnswer,
        }))
    );
  },
});

/** Asks a public question about an item. The event of its current listing must allow it. */
export const ask = mutation({
  args: { productId: v.id('products'), question: v.string() },
  handler: async (ctx, { productId, question }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Bitte melde dich an, um eine Frage zu stellen.');

    const product = await ctx.db.get(productId);
    if (!product || product.moderation) throw new ConvexError('Artikel nicht gefunden.');
    if (product.vendorId === userId) {
      throw new ConvexError('Zu eigenen Artikeln kannst du keine Fragen stellen.');
    }

    const listing = await findActiveEventListing(ctx, productId, Date.now());
    if (!listing || !resolveEventFeatures(listing.event).questions) {
      throw new ConvexError('Zu diesem Artikel können keine Fragen gestellt werden.');
    }

    const text = question.trim();
    if (text.length < 3) throw new ConvexError('Bitte formuliere deine Frage etwas genauer.');
    if (text.length > MAX_QUESTION_LENGTH) {
      throw new ConvexError(`Die Frage darf höchstens ${MAX_QUESTION_LENGTH} Zeichen haben.`);
    }

    const existing = await ctx.db
      .query('productQuestions')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect();
    const openByUser = existing.filter((q) => q.askerId === userId && !q.answer).length;
    if (openByUser >= MAX_OPEN_QUESTIONS_PER_USER) {
      throw new ConvexError(
        'Bitte warte, bis der Verkäufer deine bisherigen Fragen beantwortet hat.'
      );
    }

    const questionId = await ctx.db.insert('productQuestions', {
      eventId: listing.event._id,
      productId,
      askerId: userId,
      question: text,
      createdAt: Date.now(),
    });

    await notifyUser(ctx, product.vendorId, {
      subject: `Neue Frage zu „${product.title}“`,
      heading: 'Neue Frage zu deinem Artikel',
      paragraphs: [`Zu „${product.title}“ wurde gefragt:`, `„${text}“`],
      link: { label: 'Frage beantworten', path: `/products/view/${productId}` },
      footnote: 'Deine Antwort ist für alle sichtbar, die den Artikel ansehen.',
    });

    return questionId;
  },
});

/** Seller (or the organizer of a walk-in seller) answers or edits the answer to a question. */
export const answer = mutation({
  args: { questionId: v.id('productQuestions'), answer: v.string() },
  handler: async (ctx, { questionId, answer }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Not authenticated');

    const question = await ctx.db.get(questionId);
    if (!question) throw new ConvexError('Frage nicht gefunden.');
    const product = await ctx.db.get(question.productId);
    if (!product || !(await canActForSeller(ctx, product, userId))) {
      throw new ConvexError('Not authorized');
    }

    const text = answer.trim();
    if (!text) throw new ConvexError('Bitte gib eine Antwort ein.');
    if (text.length > MAX_ANSWER_LENGTH) {
      throw new ConvexError(`Die Antwort darf höchstens ${MAX_ANSWER_LENGTH} Zeichen haben.`);
    }

    const isFirstAnswer = !question.answer;
    await ctx.db.patch(questionId, { answer: text, answeredBy: userId, answeredAt: Date.now() });

    if (isFirstAnswer) {
      await notifyUser(ctx, question.askerId, {
        subject: `Antwort auf deine Frage zu „${product.title}“`,
        heading: 'Deine Frage wurde beantwortet',
        paragraphs: [`Du hast gefragt: „${question.question}“`, `Antwort: „${text}“`],
        link: { label: 'Artikel ansehen', path: `/products/view/${product._id}` },
      });
    }
  },
});

/** Removes a question. Allowed for the asker, the seller and the event organizers. */
export const remove = mutation({
  args: { questionId: v.id('productQuestions') },
  handler: async (ctx, { questionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Not authenticated');

    const question = await ctx.db.get(questionId);
    if (!question) return;
    const product = await ctx.db.get(question.productId);
    const allowed =
      question.askerId === userId ||
      (product && (await canActForSeller(ctx, product, userId))) ||
      (await hasAnyEventRoleOrAdmin(ctx, question.eventId, userId, ['organizer', 'coorganizer']));
    if (!allowed) throw new ConvexError('Not authorized');

    await ctx.db.delete(questionId);
  },
});
