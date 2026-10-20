import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import { findActiveEventListing } from './eventProducts';
import { hasAnyEventRoleOrAdmin } from './eventRoles';
import { resolveEventFeatures } from './eventFeatures';
import { canActForSeller } from './offers';
import { displayName, notifyUser } from './notifications';
import { appError } from './errors';

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
    // Hidden by moderation: only the seller side still sees the questions.
    if (product.moderation && !canAnswer) return [];

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
    if (!userId) throw appError('auth.loginToAsk');

    const product = await ctx.db.get(productId);
    if (!product || product.moderation) throw appError('notFound.product');
    if (product.vendorId === userId) {
      throw appError('question.ownItem');
    }
    if (product.sold) throw appError('product.alreadySold');

    const listing = await findActiveEventListing(ctx, productId, Date.now());
    if (!listing || !resolveEventFeatures(listing.event).questions) {
      throw appError('question.notAllowed');
    }

    const text = question.trim();
    if (text.length < 3) throw appError('question.tooShort');
    if (text.length > MAX_QUESTION_LENGTH) {
      throw appError('question.tooLong', { max: MAX_QUESTION_LENGTH });
    }

    const existing = await ctx.db
      .query('productQuestions')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect();
    const openByUser = existing.filter((q) => q.askerId === userId && !q.answer).length;
    if (openByUser >= MAX_OPEN_QUESTIONS_PER_USER) {
      throw appError('question.waitForAnswers');
    }

    const questionId = await ctx.db.insert('productQuestions', {
      eventId: listing.event._id,
      productId,
      askerId: userId,
      question: text,
      createdAt: Date.now(),
    });

    await notifyUser(
      ctx,
      product.vendorId,
      (t) => ({
        category: 'questions',
        subject: t('question.new.subject', { title: product.title }),
        heading: t('question.new.heading'),
        paragraphs: [t('question.new.text', { title: product.title }), t('common.quote', { text })],
        link: { label: t('question.new.link'), path: `/products/view/${productId}` },
        footnote: t('question.new.footnote'),
      }),
      'products'
    );

    return questionId;
  },
});

/** Seller (or the organizer of a walk-in seller) answers or edits the answer to a question. */
export const answer = mutation({
  args: { questionId: v.id('productQuestions'), answer: v.string() },
  handler: async (ctx, { questionId, answer }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');

    const question = await ctx.db.get(questionId);
    if (!question) throw appError('notFound.question');
    const product = await ctx.db.get(question.productId);
    if (!product || !(await canActForSeller(ctx, product, userId))) {
      throw appError('auth.forbidden');
    }

    const text = answer.trim();
    if (!text) throw appError('question.answerEmpty');
    if (text.length > MAX_ANSWER_LENGTH) {
      throw appError('question.answerTooLong', { max: MAX_ANSWER_LENGTH });
    }

    const isFirstAnswer = !question.answer;
    await ctx.db.patch(questionId, { answer: text, answeredBy: userId, answeredAt: Date.now() });

    if (isFirstAnswer) {
      await notifyUser(ctx, question.askerId, (t) => ({
        category: 'buyer',
        subject: t('question.answered.subject', { title: product.title }),
        heading: t('question.answered.heading'),
        paragraphs: [
          t('question.answered.asked', { question: question.question }),
          t('question.answered.answer', { answer: text }),
        ],
        link: { label: t('moderation.viewProduct'), path: `/products/view/${product._id}` },
      }));
    }
  },
});

/** Removes a question. Allowed for the asker, the seller and the event organizers. */
export const remove = mutation({
  args: { questionId: v.id('productQuestions') },
  handler: async (ctx, { questionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw appError('auth.required');

    const question = await ctx.db.get(questionId);
    if (!question) return;
    const product = await ctx.db.get(question.productId);
    const allowed =
      question.askerId === userId ||
      (product && (await canActForSeller(ctx, product, userId))) ||
      (await hasAnyEventRoleOrAdmin(ctx, question.eventId, userId, ['organizer', 'coorganizer']));
    if (!allowed) throw appError('auth.forbidden');

    await ctx.db.delete(questionId);
  },
});
