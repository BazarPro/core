'use node';

import { internalAction } from './_generated/server';
import { v } from 'convex/values';
import net from 'node:net';
import tls from 'node:tls';
import { api, internal } from './_generated/api';

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

    const host = process.env.AUTH_SMTP_HOST;
    const port = Number(process.env.AUTH_SMTP_PORT ?? 587);
    const secure = parseBoolean(process.env.AUTH_SMTP_SECURE, false);
    const startTls = parseBoolean(process.env.AUTH_SMTP_STARTTLS, true);
    const user = process.env.AUTH_SMTP_USER;
    const pass = process.env.AUTH_SMTP_PASS;
    const fromHeader = decodeAuthEmailFrom(process.env.AUTH_EMAIL_FROM);
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

    const userFacingLink = buildUserFacingLink(url, code, to);
    const isResetFlow = Boolean(userFacingLink && userFacingLink.includes('mode=reset'));
    const subject = isResetFlow
      ? 'Setze dein BazarPro Passwort zurück'
      : 'Bestätige deine E-Mail-Adresse für BazarPro';

    const htmlBody = `
      <!DOCTYPE html>
      <html>
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
              <svg class="logo-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
                <path d="M3 6h18"></path>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>
              <span class="logo-text">BazarPro</span>
            </div>
          </div>
          <div class="content">
            <h1>${isResetFlow ? 'Passwort zurücksetzen' : 'E-Mail-Adresse bestätigen'}</h1>
            <p>${
              isResetFlow
                ? 'Wir haben eine Passwort-Zurücksetzung für dein Konto erhalten. Nutze den folgenden Code, um ein neues Passwort zu setzen:'
                : 'Vielen Dank für deine Registrierung bei BazarPro! Bitte nutze den folgenden Code, um deine E-Mail-Adresse zu bestätigen:'
            }</p>
            
            <div class="code-container">${code}</div>
            
            ${userFacingLink ? `<a href="${userFacingLink}" class="button">${isResetFlow ? 'Reset-Link öffnen' : 'Direkt bestätigen'}</a>` : ''}
            
            <p class="expiry">Dieser Code ist 15 Minuten gültig.</p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} BazarPro. Alle Rechte vorbehalten.
          </div>
        </div>
      </body>
      </html>
    `;

    const message = [
      `From: ${fromHeader}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      dotStuff(htmlBody),
      '.',
      '',
    ].join('\r\n');

    conn.writeRaw(message);
    await expectCode(conn, [250], 'Message delivery');
    conn.writeLine('QUIT');
    await expectCode(conn, [221], 'QUIT');
    conn.end();
  },
});
