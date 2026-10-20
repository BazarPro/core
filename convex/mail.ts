'use node';

import { internalAction, type ActionCtx } from './_generated/server';
import { v } from 'convex/values';
import net from 'node:net';
import tls from 'node:tls';
import { api, internal } from './_generated/api';
import { LOCALES, type Locale } from './constants';
import { formatBerlinDate } from './berlinTime';
import { mailT, type MailT } from './i18n';

class SmtpConnection {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = '';
  private lines: string[] = [];
  private waiters: Array<(line: string) => void> = [];

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      let idx = this.buffer.indexOf('\r\n');
      while (idx !== -1) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        const waiter = this.waiters.shift();
        if (waiter) {
          waiter(line);
        } else {
          this.lines.push(line);
        }
        idx = this.buffer.indexOf('\r\n');
      }
    });
  }

  writeLine(line: string) {
    this.socket.write(`${line}\r\n`);
  }

  writeRaw(raw: string) {
    this.socket.write(raw);
  }

  async readLine(timeoutMs = 10_000): Promise<string> {
    if (this.lines.length > 0) {
      return this.lines.shift() as string;
    }
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('SMTP timeout while waiting for response line.'));
      }, timeoutMs);
      this.waiters.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }

  async readResponse(timeoutMs = 10_000): Promise<{ code: number; lines: string[] }> {
    const lines: string[] = [];
    let code = 0;
    while (true) {
      const line = await this.readLine(timeoutMs);
      lines.push(line);
      if (line.length < 3) {
        throw new Error(`Invalid SMTP response line: "${line}"`);
      }
      code = Number(line.slice(0, 3));
      if (!Number.isFinite(code)) {
        throw new Error(`Invalid SMTP response code in line: "${line}"`);
      }
      const hasMore = line.length >= 4 && line[3] === '-';
      if (!hasMore) {
        return { code, lines };
      }
    }
  }

  end() {
    this.socket.end();
  }
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function parseFromAddress(fromHeader: string) {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match?.[1] ?? fromHeader).trim();
}

function getEhloHost(explicitHost: string | undefined, envelopeFrom: string) {
  if (explicitHost?.trim()) return explicitHost.trim();
  const domain = envelopeFrom.split('@')[1]?.trim();
  if (domain && domain.includes('.')) return domain;
  return 'localhost';
}

/**
 * From header: the address of AUTH_EMAIL_FROM, with `senderName` as display name if
 * given. Names are quoted (dots as in "e.V." need that) or RFC 2047-encoded.
 */
export function buildFromHeader(rawFrom: string | undefined, senderName?: string): string {
  const configured = decodeAuthEmailFrom(rawFrom);
  const name = senderName?.replace(/[<>"\\\r\n]/g, '').trim();
  if (!name) return configured;
  const address = parseFromAddress(configured);
  const displayName = /^[\x20-\x7E]*$/.test(name) ? `"${name}"` : encodeHeader(name);
  return `${displayName} <${address}>`;
}

function decodeAuthEmailFrom(raw: string | undefined) {
  if (!raw) return 'BazarPro <noreply@localhost>';
  if (raw.includes('<') && raw.includes('@')) return raw;
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
    if (decoded.includes('<') && decoded.includes('@')) {
      return decoded;
    }
  } catch {
    // Keep raw value as-is.
  }
  return raw;
}

function dotStuff(body: string) {
  return body
    .replace(/\r?\n/g, '\r\n')
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

function buildUserFacingLink(rawUrl: string | undefined, code: string, email: string) {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    const isResetFlow = parsed.pathname.includes('/login');
    if (isResetFlow) {
      parsed.searchParams.set('mode', 'reset');
      parsed.searchParams.set('resetCode', code);
      parsed.searchParams.set('email', email);
      parsed.searchParams.delete('code');
      return parsed.toString();
    }
    parsed.searchParams.set('mode', 'verify');
    parsed.searchParams.set('verifyCode', code);
    parsed.searchParams.set('email', email);
    parsed.searchParams.delete('code');
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

async function expectCode(
  conn: SmtpConnection,
  expectedCodes: number[],
  context: string
): Promise<{ code: number; lines: string[] }> {
  const response = await conn.readResponse();
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`${context} failed. SMTP response: ${response.lines.join(' | ')}`);
  }
  return response;
}

async function connectSocket(
  host: string,
  port: number,
  secure: boolean
): Promise<net.Socket | tls.TLSSocket> {
  if (secure) {
    return await new Promise<tls.TLSSocket>((resolve, reject) => {
      const socket = tls.connect({ host, port, servername: host }, () => resolve(socket));
      socket.once('error', reject);
    });
  }
  return await new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect({ host, port }, () => resolve(socket));
    socket.once('error', reject);
  });
}

async function upgradeToTls(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
  return await new Promise<tls.TLSSocket>((resolve, reject) => {
    const tlsSocket = tls.connect({ socket, servername: host }, () => resolve(tlsSocket));
    tlsSocket.once('error', reject);
  });
}

/**
 * Encodes a header value as RFC 2047 UTF-8 if it contains non-ASCII characters.
 * Line breaks become spaces: subjects carry user text (item and bazaar titles,
 * organizer messages), and a raw CR/LF would start a new header such as Bcc.
 */
function encodeHeader(raw: string) {
  // eslint-disable-next-line no-control-regex
  const value = raw.replace(/[\r\n\x00]+/g, ' ');
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** True if an SMTP server is configured (AUTH_SMTP_HOST). */
function isSmtpConfigured() {
  return Boolean(process.env.AUTH_SMTP_HOST);
}

/** Sends one HTML email via the configured SMTP server. */
async function sendMail({
  to,
  subject,
  html,
  senderName,
  headers = [],
}: {
  to: string;
  subject: string;
  html: string;
  /** Display name instead of the one in AUTH_EMAIL_FROM, e.g. the association's name */
  senderName?: string;
  /** Extra header lines, e.g. List-Unsubscribe */
  headers?: string[];
}) {
  const host = process.env.AUTH_SMTP_HOST;
  const port = Number(process.env.AUTH_SMTP_PORT ?? 587);
  const secure = parseBoolean(process.env.AUTH_SMTP_SECURE, false);
  const startTls = parseBoolean(process.env.AUTH_SMTP_STARTTLS, true);
  const user = process.env.AUTH_SMTP_USER;
  const pass = process.env.AUTH_SMTP_PASS;
  const fromHeader = buildFromHeader(process.env.AUTH_EMAIL_FROM, senderName);
  const envelopeFrom = parseFromAddress(fromHeader);
  const ehloHost = getEhloHost(process.env.AUTH_SMTP_EHLO_HOST, envelopeFrom);

  if (!host) throw new Error('Missing AUTH_SMTP_HOST.');
  if (!Number.isFinite(port) || port <= 0) throw new Error('Invalid AUTH_SMTP_PORT.');

  let rawSocket = await connectSocket(host, port, secure);
  let conn = new SmtpConnection(rawSocket);

  await expectCode(conn, [220], 'SMTP greeting');
  conn.writeLine(`EHLO ${ehloHost}`);
  let ehlo = await expectCode(conn, [250], 'EHLO');
  const supportsStartTls = ehlo.lines.some((line) => line.toUpperCase().includes('STARTTLS'));

  if (!secure && startTls && supportsStartTls) {
    conn.writeLine('STARTTLS');
    await expectCode(conn, [220], 'STARTTLS');
    const tlsSocket = await upgradeToTls(rawSocket, host);
    rawSocket = tlsSocket;
    conn = new SmtpConnection(tlsSocket);
    conn.writeLine(`EHLO ${ehloHost}`);
    ehlo = await expectCode(conn, [250], 'EHLO after STARTTLS');
  }

  if (user && pass) {
    conn.writeLine('AUTH LOGIN');
    await expectCode(conn, [334], 'AUTH LOGIN');
    conn.writeLine(Buffer.from(user, 'utf8').toString('base64'));
    await expectCode(conn, [334], 'SMTP username');
    conn.writeLine(Buffer.from(pass, 'utf8').toString('base64'));
    await expectCode(conn, [235], 'SMTP password');
  }

  conn.writeLine(`MAIL FROM:<${envelopeFrom}>`);
  await expectCode(conn, [250], 'MAIL FROM');
  conn.writeLine(`RCPT TO:<${to}>`);
  await expectCode(conn, [250, 251], 'RCPT TO');
  conn.writeLine('DATA');
  await expectCode(conn, [354], 'DATA');

  const message = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    ...headers,
    '',
    dotStuff(html),
    '.',
    '',
  ].join('\r\n');

  conn.writeRaw(message);
  await expectCode(conn, [250], 'Message delivery');
  conn.writeLine('QUIT');
  await expectCode(conn, [221], 'QUIT');
  conn.end();
}

export interface MailBrand {
  name: string;
  logoUrl: string | null;
  /** Self-hosted association: its name is also the sender name */
  isInstance: boolean;
}

const BAZARPRO_BRAND: MailBrand = { name: 'BazarPro', logoUrl: null, isInstance: false };

/** Name and logo in emails: the association on a self-hosted instance, else BazarPro. */
async function loadBrand(ctx: ActionCtx): Promise<MailBrand> {
  try {
    const config = await ctx.runQuery(api.instance.getConfig, {});
    if (config.mode !== 'single') return BAZARPRO_BRAND;
    return { name: config.brand, logoUrl: config.logoUrl, isInstance: true };
  } catch {
    return BAZARPRO_BRAND;
  }
}

/** Shared frame of all emails: logo, white content box, footer. */
export function emailLayout(
  content: string,
  brand: MailBrand = BAZARPRO_BRAND,
  t: MailT = mailT()
) {
  const name = escapeHtml(brand.name);
  const year = new Date().getFullYear();
  const footer = brand.isInstance
    ? `&copy; ${year} ${name} · ${escapeHtml(t('layout.poweredBy'))}`
    : `&copy; ${year} BazarPro. ${escapeHtml(t('layout.rights'))}`;
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="" height="40" style="height: 40px; width: auto; vertical-align: middle;">`
    : `<svg class="logo-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
                <path d="M3 6h18"></path>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>`;
  return `
      <!DOCTYPE html>
      <html lang="${t('layout.lang')}">
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo-container { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
          .logo-icon { color: #2563eb; }
          .logo-text { font-size: 24px; font-weight: bold; color: #2563eb; }
          .content { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; text-align: center; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1); }
          h1 { font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #111827; }
          p { margin-bottom: 24px; color: #4b5563; }
          .code-container { background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0; letter-spacing: 4px; font-size: 32px; font-weight: bold; color: #111827; }
          .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #9ca3af; }
          .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px; }
          .expiry { font-size: 13px; color: #9ca3af; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-container">
              ${logo}
              <span class="logo-text">${name}</span>
            </div>
          </div>
          <div class="content">${content}          </div>
          <div class="footer">
            ${footer}
          </div>
        </div>
      </body>
      </html>
`;
}

/** Escapes user-provided text for HTML emails. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const sendVerificationEmail = internalAction({
  args: {
    to: v.string(),
    code: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, { to, code, url }) => {
    const e2eFlag = await ctx.runQuery(api.featureFlags.get, {
      key: 'is_e2e_auth_skip_email',
    });
    const isE2EAuthSkipEmailEnabled = e2eFlag?.['is_e2e_auth_skip_email'] === true;

    if (isE2EAuthSkipEmailEnabled) {
      await ctx.runMutation(internal.users.setE2eVerificationCode, {
        email: to,
        code,
      });
      return;
    }

    const userFacingLink = buildUserFacingLink(url, code, to);
    const isResetFlow = Boolean(userFacingLink && userFacingLink.includes('mode=reset'));
    const brand = await loadBrand(ctx);
    // The account exists already: sign-up stores the language chosen in the app
    const t = mailT(await ctx.runQuery(internal.users.getLocaleByEmail, { email: to }));
    const flow = isResetFlow ? 'reset' : 'verify';
    const subject = t(`${flow}.subject`, { brand: brand.name });

    const htmlBody = emailLayout(
      `
            <h1>${escapeHtml(t(`${flow}.heading`))}</h1>
            <p>${escapeHtml(t(`${flow}.text`, { brand: brand.name }))}</p>
            
            <div class="code-container">${code}</div>
            
            ${userFacingLink ? `<a href="${userFacingLink}" class="button">${escapeHtml(t(`${flow}.button`))}</a>` : ''}
            
            <p class="expiry">${escapeHtml(t('verify.expiry'))}</p>
`,
      brand,
      t
    );

    await sendMail({
      to,
      subject,
      html: htmlBody,
      senderName: brand.isInstance ? brand.name : undefined,
    });
  },
});

/** Tells all administrators that a public event waits for approval. */
export const notifyAdminsEventPending = internalAction({
  args: { eventId: v.id('events'), triggeredBy: v.id('users') },
  handler: async (ctx, { eventId, triggeredBy }) => {
    const e2eFlag = await ctx.runQuery(api.featureFlags.get, { key: 'is_e2e_auth_skip_email' });
    if (e2eFlag?.['is_e2e_auth_skip_email'] === true) return;
    if (!isSmtpConfigured()) {
      console.warn(
        '[mail] No SMTP server configured, admins are not notified about pending events'
      );
      return;
    }

    const notice = await ctx.runQuery(internal.events.getPendingApprovalNotice, {
      eventId,
      triggeredBy,
    });
    if (!notice || notice.recipients.length === 0) return;

    const siteUrl = (process.env.SITE_URL ?? 'https://bazarpro.de').replace(/\/+$/, '');
    const html = (locale: Locale) => {
      const t = mailT(locale);
      const start = formatBerlinDate(notice.startDate, locale);
      const end = formatBerlinDate(notice.endDate, locale);
      const date = start === end ? start : `${start} – ${end}`;
      return emailLayout(
        `
            <h1>${escapeHtml(t('pending.heading'))}</h1>
            <p>${escapeHtml(t('pending.text', { name: notice.organizerName }))}</p>
            <table style="margin: 0 auto 8px; text-align: left; border-collapse: collapse;">
              <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">${escapeHtml(t('pending.bazaar'))}</td><td style="padding: 4px 0; font-weight: 600; color: #111827;">${escapeHtml(notice.title)}</td></tr>
              <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">${escapeHtml(t('pending.date'))}</td><td style="padding: 4px 0; color: #111827;">${escapeHtml(date)}</td></tr>
              <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">${escapeHtml(t('pending.location'))}</td><td style="padding: 4px 0; color: #111827;">${escapeHtml(notice.location)}</td></tr>
            </table>
            <a href="${siteUrl}/admin/events" class="button">${escapeHtml(t('pending.button'))}</a>
            <p class="expiry">${escapeHtml(t('pending.footnote'))}</p>
    `,
        BAZARPRO_BRAND,
        t
      );
    };

    for (const { email: to, locale } of notice.recipients) {
      try {
        await sendMail({
          to,
          subject: mailT(locale)('pending.subject', { title: notice.title }),
          html: html(locale),
        });
      } catch (err) {
        // One unreachable admin must not keep the others from being notified
        console.error(`[mail] Could not notify ${to} about pending event ${eventId}`, err);
      }
    }
  },
});

/**
 * Lets mail clients show their own "unsubscribe" button. One-click (RFC 8058) needs
 * the backend's HTTP URL; without CONVEX_SITE_URL only the page in the app is offered.
 */
function listUnsubscribeHeaders(
  siteUrl: string,
  unsubscribe: { path: string; oneClickPath: string }
): string[] {
  const backendUrl = process.env.CONVEX_SITE_URL?.replace(/\/+$/, '');
  if (!backendUrl) return [`List-Unsubscribe: <${siteUrl}${encodeURI(unsubscribe.path)}>`];
  return [
    `List-Unsubscribe: <${backendUrl}${encodeURI(unsubscribe.oneClickPath)}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
  ];
}

/**
 * Generic notification email (sold item, price offers, questions, purchase receipt).
 * All text is escaped here; callers pass plain strings. `link.path` is relative to SITE_URL.
 */
export const sendNotification = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    heading: v.string(),
    paragraphs: v.array(v.string()),
    details: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
    link: v.optional(v.object({ label: v.string(), path: v.string() })),
    footnote: v.optional(v.string()),
    locale: v.optional(v.union(...LOCALES.map(v.literal))),
    unsubscribe: v.optional(
      v.object({ path: v.string(), oneClickPath: v.string(), category: v.string() })
    ),
  },
  handler: async (
    ctx,
    { to, subject, heading, paragraphs, details, link, footnote, locale, unsubscribe }
  ) => {
    const t = mailT(locale);
    const e2eFlag = await ctx.runQuery(api.featureFlags.get, { key: 'is_e2e_auth_skip_email' });
    if (e2eFlag?.['is_e2e_auth_skip_email'] === true) return;
    if (!isSmtpConfigured()) {
      console.warn(`[mail] No SMTP server configured, skipping notification "${subject}"`);
      return;
    }

    const siteUrl = (process.env.SITE_URL ?? 'https://bazarpro.de').replace(/\/+$/, '');
    const rows = (details ?? [])
      .map(
        (row) =>
          `<tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">${escapeHtml(row.label)}</td><td style="padding: 4px 0; color: #111827; font-weight: 600;">${escapeHtml(row.value)}</td></tr>`
      )
      .join('');
    const brand = await loadBrand(ctx);
    const html = emailLayout(
      `
            <h1>${escapeHtml(heading)}</h1>
            ${paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('\n            ')}
            ${rows ? `<table style="margin: 0 auto 8px; text-align: left; border-collapse: collapse;">${rows}</table>` : ''}
            ${link ? `<a href="${siteUrl}${encodeURI(link.path)}" class="button">${escapeHtml(link.label)}</a>` : ''}
            ${footnote ? `<p class="expiry">${escapeHtml(footnote)}</p>` : ''}
            ${unsubscribe ? `<p class="expiry">${escapeHtml(t('layout.whyThisMail', { category: unsubscribe.category }))} <a href="${siteUrl}${encodeURI(unsubscribe.path)}">${escapeHtml(t('layout.unsubscribe'))}</a></p>` : ''}
    `,
      brand,
      t
    );

    try {
      await sendMail({
        to,
        subject,
        html,
        senderName: brand.isInstance ? brand.name : undefined,
        headers: unsubscribe ? listUnsubscribeHeaders(siteUrl, unsubscribe) : [],
      });
    } catch (err) {
      // Notifications are best effort; the action that triggered them already succeeded
      console.error(`[mail] Could not send "${subject}"`, err);
    }
  },
});
