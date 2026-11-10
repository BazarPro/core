import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasBack,
  layoutPromo,
  loadPromoFonts,
  PROMO_DESIGNS,
  PROMO_FORMATS,
  promoAspect,
  renderPromo,
  showsBlocks,
  tint,
  wrap,
  type PromoFormatId,
  type PromoSpec,
} from './renderPromo';
import { fakeContext, fakePainter, sampleContent } from './promoTestUtils';

const photo = { width: 800, height: 600 } as unknown as CanvasImageSource;

function spec(overrides: Partial<PromoSpec> = {}): PromoSpec {
  return {
    format: 'poster',
    design: 'photo',
    color: '#3046c5',
    content: sampleContent(),
    qrUrl: 'https://bazarpro.de/e/skibasar',
    footer: 'Alle Infos auf BazarPro.de',
    image: photo,
    imageFocus: 50,
    ...overrides,
  };
}

const FORMATS = Object.keys(PROMO_FORMATS) as PromoFormatId[];

describe('promoAspect', () => {
  it('is width / height of paper and of pixel formats', () => {
    expect(promoAspect('poster')).toBeCloseTo(210 / 297);
    expect(promoAspect('banner')).toBeCloseTo(1920 / 1005);
  });
});

describe('showsBlocks / hasBack', () => {
  it('leaves the blocks off banners only', () => {
    expect(showsBlocks('banner')).toBe(false);
    expect(showsBlocks('post')).toBe(true);
  });

  it('gives flyers a back when a switched-on block is placed there', () => {
    expect(hasBack(spec({ format: 'flyer' }))).toBe(true);
    expect(hasBack(spec({ format: 'poster' }))).toBe(false);
    const content = sampleContent();
    for (const block of Object.values(content.blocks)) block.back = false;
    expect(hasBack({ format: 'flyer', content })).toBe(false);
  });
});

describe('tint', () => {
  it('mixes a color with white', () => {
    expect(tint('#000000', 0)).toBe('#000000');
    expect(tint('#000000', 1)).toBe('#ffffff');
    expect(tint('#3046c5', 0.5)).toBe('#98a3e2');
  });
});

describe('wrap', () => {
  const style = { family: 'sans', weight: 400, size: 10, color: '#000' } as const;
  const { painter } = fakePainter();

  it('breaks lines between words and keeps paragraphs', () => {
    // 5 units per letter: 50 units take 10 letters
    expect(wrap(painter, 'eins zwei drei\nvier', 50, style)).toEqual(['eins zwei', 'drei', 'vier']);
  });

  it('cuts words longer than a line', () => {
    expect(wrap(painter, 'ab Donaudampfschiff', 30, style)).toEqual([
      'ab',
      'Donaud',
      'ampfsc',
      'hiff',
    ]);
  });

  it('gives nothing for empty text', () => {
    expect(wrap(painter, '', 50, style)).toEqual([]);
  });
});

describe('loadPromoFonts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('waits for every weight and ignores fonts that fail', async () => {
    const load = vi.fn((font: string) =>
      font.includes('Fredoka') ? Promise.reject(new Error('offline')) : Promise.resolve([])
    );
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true });
    await expect(loadPromoFonts()).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(6);
    expect(load).toHaveBeenCalledWith('800 20px Inter');
  });

  it('does nothing without the font API', async () => {
    Object.defineProperty(document, 'fonts', { value: undefined, configurable: true });
    await expect(loadPromoFonts()).resolves.toBeUndefined();
  });
});

describe('layoutPromo', () => {
  for (const format of FORMATS) {
    for (const design of PROMO_DESIGNS) {
      it(`draws ${design} as ${format}`, () => {
        const { painter, texts, calls } = fakePainter();
        const { ctx } = fakeContext();
        const result = layoutPromo(spec({ format, design }), painter, ctx);
        // The many blocks of the sample fit on paper; small pictures may ask for less text
        if (PROMO_FORMATS[format].kind === 'print') expect(result.overflow).toBe(false);
        expect(texts().join(' ')).toContain('Skibasar');
        // The QR code: a white square with black runs on it
        expect(calls.some((c) => c[0] === 'rect' && c[5] === '#000000')).toBe(true);
        if (showsBlocks(format) && format !== 'flyer')
          expect(texts().join(' ')).toContain('Registrieren');
      });
    }
  }

  for (const design of PROMO_DESIGNS) {
    it(`draws the back of a ${design} flyer with the blocks placed there`, () => {
      const { painter, texts } = fakePainter();
      const { ctx } = fakeContext();
      const result = layoutPromo(spec({ format: 'flyer', design, side: 'back' }), painter, ctx);
      expect(result.overflow).toBe(false);
      expect(texts().join(' ')).toContain('Registrieren');
      expect(texts().join(' ')).toContain('ski@example.org');
      // The front blocks stay on the front
      expect(texts().join(' ')).not.toContain('Parkplätze');
    });
  }

  it('puts numbers in circles for steps and dots before bullets', () => {
    const { painter, calls, texts } = fakePainter();
    layoutPromo(spec({ format: 'post', design: 'classic' }), painter, fakeContext().ctx);
    expect(texts()).toEqual(expect.arrayContaining(['1', '2']));
    expect(texts().join(' ')).toContain('Etiketten drucken');
    expect(calls.filter((c) => c[0] === 'circle').length).toBeGreaterThanOrEqual(3);
  });

  it('draws a date sticker on playful pages', () => {
    const { painter, calls } = fakePainter();
    layoutPromo(spec({ design: 'playful' }), painter, fakeContext().ctx);
    const turned = calls.filter((c) => c[0] === 'text' && (c[5] as { angle?: number })?.angle);
    expect(turned.map((c) => c[1])).toEqual(['SA', '18', 'NOV']);
  });

  it('leaves the sticker out when the date line has no day', () => {
    const { painter, calls } = fakePainter();
    const content = sampleContent({ dateLine: 'Bald' });
    layoutPromo(spec({ design: 'playful', content }), painter, fakeContext().ctx);
    expect(calls.some((c) => c[0] === 'text' && (c[5] as { angle?: number })?.angle)).toBe(false);
  });

  it('fills the photo box with the accent color without a photo', () => {
    const { ctx, calls } = fakeContext();
    layoutPromo(spec({ image: null }), fakePainter().painter, ctx);
    expect(calls.some((c) => c[0] === 'drawImage')).toBe(false);
    expect(calls).toContainEqual(['set:fillStyle', tint('#3046c5', 0.5)]);
  });

  it('crops the photo around its focus', () => {
    const { ctx, calls } = fakeContext();
    layoutPromo(spec({ format: 'story', imageFocus: 0 }), fakePainter().painter, ctx);
    const draw = calls.find((c) => c[0] === 'drawImage')!;
    // A tall page shows a slice of the wide photo, from the middle
    expect(draw[2]).toBeGreaterThan(0);
    expect(draw[3]).toBe(0);
  });

  it('draws the site line in place of a missing QR code', () => {
    const content = sampleContent({ kicker: '', placeLine: '' });
    content.qr.enabled = false;
    for (const format of ['poster', 'banner'] as const) {
      const { painter, texts, calls } = fakePainter();
      layoutPromo(spec({ format, content }), painter, fakeContext().ctx);
      expect(calls.some((c) => c[0] === 'rect' && c[5] === '#000000')).toBe(false);
      if (format === 'poster') expect(texts().join(' ')).toContain('Alle Infos');
    }
  });

  it('draws neither QR code nor site line when both are off', () => {
    const { painter, texts } = fakePainter();
    layoutPromo(spec({ qrUrl: '', footer: ' ' }), painter, fakeContext().ctx);
    expect(texts().join(' ')).not.toContain('Alle Infos');
  });

  it('keeps tall pages in one column and empty blocks out', () => {
    const content = sampleContent();
    content.blocks.offer = { ...content.blocks.offer, title: ' ', text: ' ' };
    const { painter, texts } = fakePainter();
    layoutPromo(spec({ format: 'story', design: 'eco', content }), painter, fakeContext().ctx);
    expect(texts().join(' ')).not.toContain('Ski · Schuhe');
    expect(texts().join(' ')).toContain('Etiketten');
  });

  it('reports overflow when the texts do not fit even at the smallest type', () => {
    const long = Array.from(
      { length: 60 },
      (_, i) => `${(i % 9) + 1}. Ein ziemlich langer Schritt`
    );
    const content = sampleContent();
    content.blocks.offer.text = long.join('\n');
    for (const design of PROMO_DESIGNS) {
      const result = layoutPromo(
        spec({ design, content }),
        fakePainter().painter,
        fakeContext().ctx
      );
      expect(result.overflow).toBe(true);
    }
    const back = sampleContent();
    back.blocks.sell.text = long.join('\n');
    const result = layoutPromo(
      spec({ format: 'flyer', side: 'back', content: back }),
      fakePainter().painter,
      fakeContext().ctx
    );
    expect(result.overflow).toBe(true);
  });

  it('reports overflow on a banner with a title that does not fit', () => {
    const content = sampleContent({ title: Array(80).fill('Riesenbasar').join(' ') });
    const result = layoutPromo(
      spec({ format: 'banner', content }),
      fakePainter().painter,
      fakeContext().ctx
    );
    expect(result.overflow).toBe(true);
  });
});

describe('renderPromo', () => {
  it('clears the canvas, scales to its pixels and restores it', () => {
    const { ctx, calls } = fakeContext(2000, 2828);
    const result = renderPromo(ctx, spec({ format: 'poster' }), 2000);
    expect(result.overflow).toBe(false);
    expect(calls[0]).toEqual(['save']);
    expect(calls).toContainEqual(['clearRect', 0, 0, 2000, 2828]);
    expect(calls).toContainEqual(['scale', 2, 2]);
    expect(calls.some((c) => c[0] === 'fillText' && String(c[1]).startsWith('Skibasar'))).toBe(
      true
    );
    expect(calls[calls.length - 1]).toEqual(['restore']);
  });
});
