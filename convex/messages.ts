import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { appError } from './errors';

export const sendMessage = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    message: v.string(),
    acceptedPrivacyPolicy: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.acceptedPrivacyPolicy) {
      throw appError('account.privacyRequired');
    }

    const messageId = await ctx.db.insert('messages', {
      ...args,
      createdAt: Date.now(),
    });

    return messageId;
  },
});
