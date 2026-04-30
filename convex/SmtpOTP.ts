import type { EmailConfig } from '@convex-dev/auth/server';
import { internal } from './_generated/api';

const AUTH_EMAIL_FROM = process.env.AUTH_EMAIL_FROM ?? 'BazarPro <noreply@localhost>';

export const SmtpOTP = {
  id: 'smtp-otp',
  type: 'email',
  name: 'SMTP OTP',
  from: AUTH_EMAIL_FROM,
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return String(Math.floor(100000 + Math.random() * 900000));
  },
  async sendVerificationRequest(
    params: { identifier: string; token: string; url?: string },
    ctx?: {
      runAction: (
        ref: unknown,
        args: {
          to: string;
          code: string;
          url?: string;
        }
      ) => Promise<void>;
    }
  ) {
    const { identifier, token, url } = params;
    if (!ctx?.runAction) {
      throw new Error('Missing Convex action context for SMTP verification email.');
    }

    await ctx.runAction(internal.mail.sendVerificationEmail, {
      to: identifier,
      code: token,
      url,
    });
  },
} as unknown as EmailConfig;
