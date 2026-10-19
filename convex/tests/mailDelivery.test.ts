// @vitest-environment node
import net from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../schema';
import { internal } from '../_generated/api';

interface FakeSmtp {
  port: number;
  /** Raw DATA of each delivered message */
  messages: string[];
  /** SMTP commands as received, e.g. "MAIL FROM:<…>" */
  commands: string[];
  close: () => Promise<void>;
}

/**
 * Minimal SMTP server: plain text, AUTH LOGIN, answers every command with success.
 * `rejectRecipient` lets RCPT TO fail like a real server would for unknown users.
 */
async function startFakeSmtp(options: { rejectRecipient?: boolean } = {}): Promise<FakeSmtp> {
  const messages: string[] = [];
  const commands: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let buffer = '';
    let inData = false;
    let authStep = 0;
    socket.setEncoding('utf8');
    socket.write('220 fake.smtp ESMTP\r\n');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (inData) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        messages.push(buffer.slice(0, end));
        buffer = buffer.slice(end + 5);
        inData = false;
        socket.write('250 queued\r\n');
      }
      let idx = buffer.indexOf('\r\n');
      while (!inData && idx !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        commands.push(line);
        if (authStep === 1) {
          authStep = 2;
          socket.write('334 UGFzc3dvcmQ6\r\n');
        } else if (authStep === 2) {
          authStep = 0;
          socket.write('235 authenticated\r\n');
        } else if (line.startsWith('EHLO')) {
          socket.write('250-fake.smtp\r\n250 AUTH LOGIN\r\n');
        } else if (line === 'AUTH LOGIN') {
          authStep = 1;
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (line.startsWith('RCPT TO') && options.rejectRecipient) {
          socket.write('550 no such user\r\n');
        } else if (line === 'DATA') {
          inData = true;
          socket.write('354 go ahead\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 bye\r\n');
        } else {
          socket.write('250 ok\r\n');
        }
        idx = inData ? -1 : buffer.indexOf('\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    port,
    messages,
    commands,
    // A client that gave up after an error leaves its connection open
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

const NOTIFICATION = {
  to: 'kaeufer@test.de',
  subject: 'Verkauft: Kinderrad für Mädchen',
  heading: 'Dein Artikel wurde verkauft',
  paragraphs: ['Dein Kinderrad hat einen neuen Besitzer.'],
  details: [{ label: 'Preis', value: '40,00 €' }],
  link: { label: 'Zu meinen Verkäufen', path: '/my-sales' },
  footnote: 'Danke!',
};

let smtp: FakeSmtp;

beforeEach(async () => {
  // Real timers: the SMTP client and the fake server talk over real sockets
  vi.useRealTimers();
  smtp = await startFakeSmtp();
  vi.stubEnv('AUTH_SMTP_HOST', '127.0.0.1');
  vi.stubEnv('AUTH_SMTP_PORT', String(smtp.port));
  vi.stubEnv('AUTH_SMTP_STARTTLS', 'false');
  vi.stubEnv('AUTH_SMTP_USER', 'basar@verein.de');
  vi.stubEnv('AUTH_SMTP_PASS', 'geheim');
  vi.stubEnv('AUTH_EMAIL_FROM', 'Basar <basar@verein.de>');
  vi.stubEnv('SITE_URL', 'https://basar.verein.de/');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await smtp.close();
});

describe('email delivery', () => {
  test('platform: sender and layout of BazarPro, login and envelope as configured', async () => {
    const t = convexTest(schema);
    await t.action(internal.mail.sendNotification, NOTIFICATION);

    expect(smtp.commands).toContain('AUTH LOGIN');
    expect(smtp.commands).toContain('MAIL FROM:<basar@verein.de>');
    expect(smtp.commands).toContain('RCPT TO:<kaeufer@test.de>');
    const [message] = smtp.messages;
    expect(message).toContain('From: Basar <basar@verein.de>');
    expect(message).toContain('<span class="logo-text">BazarPro</span>');
    expect(message).toContain('href="https://basar.verein.de/my-sales"');
    // Non-ASCII subjects are RFC 2047-encoded
    expect(message).toMatch(/Subject: =\?UTF-8\?B\?/);
  });

  test('line breaks in the subject cannot add headers', async () => {
    const t = convexTest(schema);
    await t.action(internal.mail.sendNotification, {
      ...NOTIFICATION,
      subject: 'Verkauft: Jacke\r\nBcc: spam@example.com',
    });
    const headers = smtp.messages[0].split('\r\n\r\n')[0].split('\r\n');
    expect(headers).toContain('Subject: Verkauft: Jacke Bcc: spam@example.com');
    expect(headers.some((line) => line.startsWith('Bcc:'))).toBe(false);
  });

  test('switchable mails carry List-Unsubscribe; one-click needs the backend URL', async () => {
    const t = convexTest(schema);
    const unsubscribe = {
      path: '/benachrichtigungen/abbestellen?t=abc&k=sales',
      oneClickPath: '/unsubscribe?t=abc&k=sales',
      category: 'Verkäufe',
    };
    vi.stubEnv('CONVEX_SITE_URL', 'https://api.basar.verein.de/');
    await t.action(internal.mail.sendNotification, { ...NOTIFICATION, unsubscribe });
    vi.stubEnv('CONVEX_SITE_URL', '');
    await t.action(internal.mail.sendNotification, { ...NOTIFICATION, unsubscribe });
    await t.action(internal.mail.sendNotification, NOTIFICATION);

    const headers = smtp.messages.map((message) => message.split('\r\n\r\n')[0]);
    expect(headers[0]).toContain(
      'List-Unsubscribe: <https://api.basar.verein.de/unsubscribe?t=abc&k=sales>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click'
    );
    // Without the backend URL only the page in the app, which needs a click
    expect(headers[1]).toContain(
      'List-Unsubscribe: <https://basar.verein.de/benachrichtigungen/abbestellen?t=abc&k=sales>'
    );
    expect(headers[1]).not.toContain('List-Unsubscribe-Post');
    // Always-sent mails have neither
    expect(headers[2]).not.toContain('List-Unsubscribe');
  });

  test('self-hosted association: its name as sender and in the layout, with its logo', async () => {
    vi.stubEnv('BAZARPRO_MODE', 'single');
    const t = convexTest(schema);
    const logo = await t.run((ctx) => ctx.storage.store(new Blob(['logo'])));
    await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('users', { name: 'Admin', systemRole: 'admin' });
      await ctx.db.insert('siteSettings', {
        name: 'Kinderbasar e.V.',
        logo,
        updatedAt: Date.now(),
        updatedBy: adminId,
      });
    });

    await t.action(internal.mail.sendNotification, NOTIFICATION);

    const [message] = smtp.messages;
    expect(message).toContain('From: "Kinderbasar e.V." <basar@verein.de>');
    expect(message).toContain('<span class="logo-text">Kinderbasar e.V.</span>');
    expect(message).toMatch(/<img src="[^"]+" alt="" height="40"/);
    expect(message).toContain('betrieben mit BazarPro');
  });

  test('verification code: subject and sender with the association name', async () => {
    vi.stubEnv('BAZARPRO_MODE', 'single');
    const t = convexTest(schema);
    await t.action(internal.mail.sendVerificationEmail, { to: 'neu@test.de', code: '123456' });

    const [message] = smtp.messages;
    expect(message).toContain('From: "Basar" <basar@verein.de>');
    expect(message).toContain('<div class="code-container">123456</div>');
  });

  test('a rejected recipient is logged, the caller is not interrupted', async () => {
    await smtp.close();
    smtp = await startFakeSmtp({ rejectRecipient: true });
    vi.stubEnv('AUTH_SMTP_PORT', String(smtp.port));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = convexTest(schema);
    await t.action(internal.mail.sendNotification, NOTIFICATION);
    expect(smtp.messages).toHaveLength(0);
    expect(String(errors.mock.calls[0]?.[1])).toContain('RCPT TO failed');
    errors.mockRestore();
  });

  test('without SMTP server or with the e2e flag nothing is sent', async () => {
    const t = convexTest(schema);
    await t.run((ctx) =>
      ctx.db.insert('featureFlags', { key: 'is_e2e_auth_skip_email', value: true })
    );
    await t.action(internal.mail.sendNotification, NOTIFICATION);
    expect(smtp.messages).toHaveLength(0);

    vi.stubEnv('AUTH_SMTP_HOST', '');
    const t2 = convexTest(schema);
    await t2.action(internal.mail.sendNotification, NOTIFICATION);
    expect(smtp.messages).toHaveLength(0);
  });
});
