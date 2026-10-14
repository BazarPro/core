import { describe, expect, test } from 'vitest';
import { buildFromHeader, emailLayout } from '../mail';

describe('sender of emails', () => {
  test('without a sender name the configured From stays as it is', () => {
    expect(buildFromHeader('Basar <basar@verein.de>')).toBe('Basar <basar@verein.de>');
    expect(buildFromHeader(undefined)).toBe('BazarPro <noreply@localhost>');
  });

  test('the association name replaces the display name, the address stays', () => {
    expect(buildFromHeader('BazarPro <noreply@verein.de>', 'Kinderbasar e.V.')).toBe(
      '"Kinderbasar e.V." <noreply@verein.de>'
    );
    expect(buildFromHeader(undefined, 'Basar')).toBe('"Basar" <noreply@localhost>');
  });

  test('umlauts are RFC 2047-encoded, header injection is impossible', () => {
    const header = buildFromHeader('x <a@b.de>', 'Kinderbasar Ölbronn');
    expect(header).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <a@b\.de>$/);
    expect(buildFromHeader('x <a@b.de>', 'Böse"\r\nBcc: x@y.de')).not.toMatch(/[\r\n"]B/);
  });
});

describe('email layout', () => {
  test('BazarPro by default, the association with its logo on a self-hosted instance', () => {
    const platform = emailLayout('<p>Hallo</p>');
    expect(platform).toContain('<span class="logo-text">BazarPro</span>');
    expect(platform).toContain('BazarPro. Alle Rechte vorbehalten.');

    const instance = emailLayout('<p>Hallo</p>', {
      name: 'Kinderbasar <Ulm>',
      logoUrl: 'https://convex-site.verein.de/api/storage/logo',
      isInstance: true,
    });
    expect(instance).toContain('<img src="https://convex-site.verein.de/api/storage/logo"');
    expect(instance).toContain('Kinderbasar &lt;Ulm&gt;');
    expect(instance).toContain('betrieben mit BazarPro');
    expect(instance).not.toContain('<svg');
  });
});
