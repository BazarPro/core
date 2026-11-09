import type { Painter, TextStyle } from './painter';
import type { PromoContent } from './promoContent';

/**
 * Fakes for the promo drawing tests: jsdom has no 2D canvas, and the layout only needs
 * text widths and a record of what was drawn.
 */

export type Call = [method: string, ...args: unknown[]];

/** A 2D context that records every method call; text is half as wide as it is tall per letter */
export function fakeContext(width = 1000, height = 1000) {
  const calls: Call[] = [];
  const state: Record<string | symbol, unknown> = {
    canvas: { width, height },
    font: '10px sans-serif',
  };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args]);
        if (prop === 'measureText') {
          const size = parseFloat(String(target.font).split(' ')[1] ?? '10');
          return { width: String(args[0]).length * size * 0.5 };
        }
        if (prop === 'createLinearGradient') {
          return { addColorStop: (...stop: unknown[]) => calls.push(['addColorStop', ...stop]) };
        }
        return undefined;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      calls.push([`set:${String(prop)}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

/** A painter that records what it draws; each letter is half the font size wide */
export function fakePainter() {
  const calls: Call[] = [];
  const painter: Painter = {
    measure: (text: string, style: TextStyle) => text.length * style.size * 0.5,
    text: (...args) => void calls.push(['text', ...args]),
    rect: (...args) => void calls.push(['rect', ...args]),
    roundRect: (...args) => void calls.push(['roundRect', ...args]),
    circle: (...args) => void calls.push(['circle', ...args]),
  };
  const texts = () => calls.filter((c) => c[0] === 'text').map((c) => c[1] as string);
  return { painter, calls, texts };
}

const block = (title: string, text: string, enabled: boolean, back: boolean) => ({
  title,
  text,
  enabled,
  back,
});

export function sampleContent(overrides: Partial<PromoContent> = {}): PromoContent {
  return {
    audience: 'sellers',
    kicker: 'Verkäufer gesucht!',
    title: 'Skibasar Blaustein',
    dateLine: 'Samstag, 18. November 2026 · 9:00–14:00 Uhr',
    placeLine: 'Mehrzweckhalle, Am Sportplatz 2, 89134 Blaustein',
    blocks: {
      offer: block('Das gibt es', 'Ski · Schuhe · Helme', true, false),
      sell: block(
        'So verkaufst du',
        '1. Registrieren\n2. Artikel anlegen\n\n- Etiketten drucken\nAbgabe am Freitag',
        true,
        true
      ),
      labels: block('Etiketten', 'Universal-Etiketten', true, true),
      help: block('Helfen', 'Wir suchen Helfer', false, true),
      arrival: block('Anfahrt', 'Parkplätze vor der Halle', true, false),
      contact: block('', 'ski@example.org', true, true),
    },
    qr: { enabled: true, caption: 'Jetzt anmelden' },
    ...overrides,
  };
}
