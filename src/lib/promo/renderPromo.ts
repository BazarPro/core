import { qrRuns, screenQr } from '../qrCode';
import { PROMO_BLOCKS, type PromoBlock, type PromoContent } from './promoContent';
import { CanvasPainter, type FontFamily, type Painter, type TextStyle } from './painter';

/**
 * Lays out a flyer, poster, banner or social media picture. The same layout draws the
 * preview and the PNG on a canvas and the PDF with real text (painter.ts), so what the
 * organizer sees is what gets printed. Photos and color gradients always go on a canvas
 * underneath (`bg`), everything else through the painter (`fg`).
 *
 * The page is 1000 units wide. The type starts large and shrinks step by step until
 * everything fits, down to the smallest size still easy to read in that format (`minType`;
 * on paper about 8 pt); below that the result reports `overflow` and the page asks to
 * shorten the texts.
 */

export const PROMO_FORMATS = {
  poster: { kind: 'print', widthMm: 210, heightMm: 297, maxType: 1.4, minType: 0.7 },
  flyer: { kind: 'print', widthMm: 148, heightMm: 210, maxType: 1.4, minType: 0.8 },
  post: { kind: 'image', width: 1080, height: 1350, maxType: 1.6, minType: 0.95 },
  story: { kind: 'image', width: 1080, height: 1920, maxType: 1.7, minType: 1.05 },
  banner: { kind: 'image', width: 1920, height: 1005, maxType: 1.3, minType: 0.75 },
} as const;
export type PromoFormatId = keyof typeof PROMO_FORMATS;

export const PROMO_DESIGNS = ['photo', 'classic', 'playful', 'eco'] as const;
export type PromoDesign = (typeof PROMO_DESIGNS)[number];

/** Accent colors to choose from; the first is the BazarPro blue */
export const PROMO_COLORS = ['#3046c5', '#0f8a5f', '#e8590c', '#d6336c', '#7048e8', '#0b7285'];

export type PromoSide = 'front' | 'back';

export interface PromoSpec {
  format: PromoFormatId;
  design: PromoDesign;
  color: string;
  content: PromoContent;
  /** Link behind the QR code */
  qrUrl: string;
  /** Small line with the site, e.g. "Alle Infos auf BazarPro.de" */
  footer: string;
  image: CanvasImageSource | null;
  /** Vertical focus of the photo, 0 = top, 100 = bottom */
  imageFocus: number;
  /** Flyers have a back with the blocks marked for it */
  side?: PromoSide;
}

export interface RenderResult {
  overflow: boolean;
}

const UNITS = 1000;
const DARK = '#16181d';

/** Width / height of the format */
export function promoAspect(format: PromoFormatId): number {
  const f = PROMO_FORMATS[format];
  return f.kind === 'print' ? f.widthMm / f.heightMm : f.width / f.height;
}

/** Banners only carry title, date, place and QR code: no room for the blocks */
export const showsBlocks = (format: PromoFormatId) => format !== 'banner';

/** Whether a flyer gets a back: some block switched on and placed there */
export function hasBack(spec: Pick<PromoSpec, 'format' | 'content'>): boolean {
  return (
    spec.format === 'flyer' &&
    PROMO_BLOCKS.some((id) => spec.content.blocks[id].enabled && spec.content.blocks[id].back)
  );
}

/** Waits for the fonts of the designs, so the first drawing does not use a fallback. */
export async function loadPromoFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(
    [
      '400 20px Inter',
      '700 20px Inter',
      '800 20px Inter',
      '500 20px Fredoka',
      '600 20px Fredoka',
      '700 20px Fredoka',
    ].map((font) => document.fonts.load(font).catch(() => undefined))
  );
}

/**
 * Lays out the page with `fg` and draws it: photos into `bg` (a canvas scaled to layout
 * units), the rest through `fg`.
 */
export function layoutPromo(
  spec: PromoSpec,
  fg: Painter,
  bg: CanvasRenderingContext2D
): RenderResult {
  const height = UNITS / promoAspect(spec.format);
  const { maxType, minType } = PROMO_FORMATS[spec.format];
  const pages: Page[] = [];
  for (let scale = maxType; scale > minType; scale = Math.round((scale - 0.04) * 100) / 100) {
    pages.push(new Page(fg, spec, UNITS, height, scale));
  }
  pages.push(new Page(fg, spec, UNITS, height, minType));
  // The largest type with a big photo, else the largest that fits at all, else the smallest
  const page =
    pages.find((p) => p.fit() === 'good') ??
    pages.find((p) => p.fit() === 'tight') ??
    pages[pages.length - 1]!;
  const fit = page.draw(bg);
  return { overflow: fit === 'overflow' };
}

/** Draws the whole page into `ctx`, which is `pixelWidth` pixels wide. */
export function renderPromo(
  ctx: CanvasRenderingContext2D,
  spec: PromoSpec,
  pixelWidth: number
): RenderResult {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.scale(pixelWidth / UNITS, pixelWidth / UNITS);
  const result = layoutPromo(spec, new CanvasPainter(ctx), ctx);
  ctx.restore();
  return result;
}

/** good: with room for a big photo; tight: the photo gets small */
type Fit = 'good' | 'tight' | 'overflow';

const fitOf = (size: number, good: number, tight: number): Fit =>
  size >= good ? 'good' : size >= tight ? 'tight' : 'overflow';

interface Theme {
  font: FontFamily;
  background: string;
  text: string;
  muted: string;
  /** Color of block titles and step numbers */
  accent: string;
}

type Measured = { height: number; draw: (x: number, y: number) => void };

const NOTHING: Measured = { height: 0, draw: () => undefined };

/** One layout of the page at one type scale */
class Page {
  readonly theme: Theme;
  readonly fg: Painter;
  readonly spec: PromoSpec;
  readonly width: number;
  readonly height: number;
  /** Type scale: 1 at the full size */
  readonly s: number;
  /** The photo canvas while drawing */
  private bg: CanvasRenderingContext2D | null = null;

  constructor(fg: Painter, spec: PromoSpec, width: number, height: number, s: number) {
    this.fg = fg;
    this.spec = spec;
    this.width = width;
    this.height = height;
    this.s = s;
    const { design, color } = spec;
    this.theme = {
      font: design === 'playful' ? 'round' : 'sans',
      background: design === 'playful' ? tint(color, 0.88) : '#ffffff',
      text: DARK,
      muted: '#4b5060',
      accent: design === 'eco' ? DARK : color,
    };
  }

  private get pad() {
    return 56;
  }

  private get side(): PromoSide {
    return this.spec.side ?? 'front';
  }

  private get blocks(): PromoBlock[] {
    if (!showsBlocks(this.spec.format)) return [];
    const flyer = this.spec.format === 'flyer';
    return PROMO_BLOCKS.map((id) => this.spec.content.blocks[id]).filter(
      (block) =>
        block.enabled &&
        (block.title.trim() || block.text.trim()) &&
        (!flyer || !!block.back === (this.side === 'back'))
    );
  }

  private get tall() {
    return this.height / this.width > 1.6;
  }

  private get wide() {
    return this.width > this.height;
  }

  // ---- Layout of each design ----

  private layout(draw: boolean): Fit {
    if (this.side === 'back' && this.spec.format === 'flyer') return this.layoutBack(draw);
    if (this.wide) return this.layoutWide(draw);
    switch (this.spec.design) {
      case 'photo':
        return this.layoutPhoto(draw);
      case 'classic':
        return this.layoutClassic(draw);
      case 'playful':
        return this.layoutPlayful(draw);
      case 'eco':
        return this.layoutEco(draw);
    }
  }

  fit(): Fit {
    return this.layout(false);
  }

  draw(bg: CanvasRenderingContext2D): Fit {
    this.bg = bg;
    try {
      return this.layout(true);
    } finally {
      this.bg = null;
    }
  }

  private get canvas(): CanvasRenderingContext2D {
    if (!this.bg) throw new Error('Drawing without a canvas');
    return this.bg;
  }

  /** Photo over the whole page, title on the photo, the facts on a white card below */
  private layoutPhoto(draw: boolean): Fit {
    const { width, height, pad, s } = this;
    const inner = width - 2 * pad;
    const card = this.cardContent(inner - 2 * 40);
    const cardHeight = card.height + 2 * 40;
    const header = this.header(inner, { color: '#ffffff', muted: '#e4e6eb' });
    const kicker = this.kicker();
    const cardTop = height - pad - cardHeight;
    const headerTop = cardTop - 44 * s - header.height;
    const free = headerTop - pad - kicker.height;
    const fits = fitOf(free, height * 0.22, 120);
    if (!draw) return fits;

    this.photo(0, 0, width, height);
    this.shade(0, 0, width, height, 'vertical', [
      [0, 0.25],
      [Math.max(0, headerTop / height - 0.18), 0.05],
      [Math.min(1, cardTop / height), 0.72],
      [1, 0.8],
    ]);
    kicker.draw(pad, pad);
    header.draw(pad, headerTop);
    this.fg.roundRect(pad, cardTop, inner, cardHeight, 28, '#ffffff');
    card.draw(pad + 40, cardTop + 40);
    return fits;
  }

  /** Photo on top, title on a band of the accent color, the facts on white below */
  private layoutClassic(draw: boolean): Fit {
    const { width, height, pad, s, theme, spec } = this;
    const inner = width - 2 * pad;
    const header = this.header(inner, {
      color: '#ffffff',
      muted: tint(spec.color, 0.82),
      kicker: true,
    });
    const body = this.cardContent(inner);
    const band = header.height + 2 * 44 * s;
    const space = height - band - body.height - 2 * pad;
    // Short texts leave the photo up to half the page
    const photoHeight = Math.min(height * 0.5, space);
    const fits = fitOf(photoHeight, height * 0.28, height * 0.16);
    if (!draw) return fits;

    const photoH = Math.max(photoHeight, height * 0.16);
    const bg = this.canvas;
    bg.fillStyle = theme.background;
    bg.fillRect(0, 0, width, height);
    this.photo(0, 0, width, photoH);
    bg.fillStyle = spec.color;
    bg.fillRect(0, photoH, width, band);
    header.draw(pad, photoH + 44 * s);
    // The rest of the page below the band, the facts centred in it
    const rest = height - photoH - band;
    body.draw(pad, photoH + band + Math.max(pad, (rest - body.height) / 2));
    return fits;
  }

  /** Pastel page, rounded photo with a date sticker, each block on its own card */
  private layoutPlayful(draw: boolean): Fit {
    const { width, height, pad, s, theme } = this;
    const inner = width - 2 * pad;
    const header = this.header(inner, {
      color: theme.text,
      muted: theme.muted,
      kicker: true,
      center: true,
    });
    const body = this.cardContent(inner, { cards: true });
    const space = height - 2 * pad - header.height - body.height - 2 * 40 * s;
    const photoHeight = Math.min(height * 0.45, space);
    const fits = fitOf(photoHeight, height * 0.26, height * 0.14);
    if (!draw) return fits;

    const photoH = Math.max(photoHeight, height * 0.14);
    this.playfulBackground();
    this.framedPhoto(pad, pad, inner, photoH, -0.02);
    this.sticker(width - pad - 30, pad + photoH - 10);

    const top = pad + photoH + 40 * s;
    const rest = height - pad - top - header.height - body.height;
    // Spare room: a little above the title, more between title and blocks
    const spare = Math.max(0, rest);
    header.draw(pad, top + spare * 0.25);
    body.draw(pad, top + header.height + 40 * s + spare * 0.6);
    return fits;
  }

  /** White and black with a small photo: little ink for the office printer */
  private layoutEco(draw: boolean): Fit {
    const { width, height, pad, s, theme } = this;
    const inner = width - 2 * pad;
    const header = this.header(inner, { color: theme.text, muted: theme.muted, kicker: true });
    const body = this.cardContent(inner);
    const space = height - 2 * pad - header.height - body.height - 2 * 36 * s;
    const photoHeight = Math.min(height * 0.2, space);
    const showPhoto = photoHeight >= height * 0.1;
    const fits = space < 0 ? 'overflow' : fitOf(photoHeight, height * 0.16, 0);
    if (!draw) return fits;

    const bg = this.canvas;
    bg.fillStyle = '#ffffff';
    bg.fillRect(0, 0, width, height);
    let y = pad;
    if (showPhoto) {
      bg.save();
      bg.beginPath();
      bg.roundRect(pad, y, inner, photoHeight, 16);
      bg.clip();
      this.photo(pad, y, inner, photoHeight);
      bg.restore();
      y += photoHeight + 36 * s;
    }
    header.draw(pad, y);
    y += header.height + 18 * s;
    this.fg.rect(pad, y, inner, 4, theme.text);
    y += 18 * s;
    body.draw(pad, y + Math.max(0, (height - pad - y - body.height) / 3));
    return fits;
  }

  /** Back of a flyer: a band with title and date, then the blocks placed there */
  private layoutBack(draw: boolean): Fit {
    const { width, height, pad, s, theme, spec } = this;
    const inner = width - 2 * pad;
    const onBand = spec.design !== 'eco' && spec.design !== 'playful';
    const title = this.paragraph(spec.content.title, inner, {
      size: 50 * Math.min(s, 1.1),
      weight: 800,
      color: onBand ? '#ffffff' : theme.text,
      family: theme.font,
      lineHeight: 1.1,
    });
    const date = this.paragraph(spec.content.dateLine, inner, {
      size: 26 * s,
      weight: 700,
      color: onBand ? tint(spec.color, 0.82) : theme.muted,
    });
    const band = title.height + 10 * s + date.height + 2 * 36 * s;
    const playful = spec.design === 'playful';
    const body = this.cardContent(inner, { cards: playful });
    const space = height - band - 2 * pad - body.height;
    const fits: Fit = space >= 0 ? 'good' : 'overflow';
    if (!draw) return fits;

    const bg = this.canvas;
    if (playful) this.playfulBackground();
    else {
      bg.fillStyle = '#ffffff';
      bg.fillRect(0, 0, width, height);
    }
    if (onBand) {
      bg.fillStyle = spec.color;
      bg.fillRect(0, 0, width, band);
    }
    title.draw(pad, 36 * s);
    date.draw(pad, 36 * s + title.height + 10 * s);
    if (spec.design === 'eco') this.fg.rect(pad, band - 4, inner, 4, theme.text);
    body.draw(pad, band + pad + Math.max(0, space / 3));
    return fits;
  }

  /** Banner (landscape): title, date and place beside the photo, the QR code on a card over it */
  private layoutWide(draw: boolean): Fit {
    const { width, height, pad, theme, spec } = this;
    const { design } = spec;
    const fullPhoto = design === 'photo';
    const column = fullPhoto ? width * 0.6 : width * 0.55;
    const inner = column - 2 * pad;
    const light = design === 'photo' || design === 'classic';
    const header = this.header(inner, {
      color: light ? '#ffffff' : theme.text,
      muted: light ? (design === 'classic' ? tint(spec.color, 0.82) : '#e4e6eb') : theme.muted,
      kicker: true,
    });
    const cardWidth = width * 0.4;
    const qr = this.qr(cardWidth, { card: true, compact: true });
    const fits: Fit =
      header.height <= height - 2 * pad && (qr?.height ?? 0) <= height * 0.5 ? 'good' : 'overflow';
    if (!draw) return fits;

    const bg = this.canvas;
    const photoX = column;
    const framed = !fullPhoto && design !== 'classic';
    if (fullPhoto) {
      this.photo(0, 0, width, height);
      this.shade(0, 0, width, height, 'horizontal', [
        [0, 0.82],
        [0.45, 0.6],
        [0.75, 0.05],
        [1, 0],
      ]);
    } else if (design === 'classic') {
      this.photo(photoX, 0, width - photoX, height);
      bg.fillStyle = spec.color;
      bg.fillRect(0, 0, column, height);
    } else if (design === 'playful') {
      this.playfulBackground();
      this.framedPhoto(photoX, pad, width - photoX - pad, height - 2 * pad, 0.02);
    } else {
      bg.fillStyle = '#ffffff';
      bg.fillRect(0, 0, width, height);
      bg.save();
      bg.beginPath();
      bg.roundRect(photoX, pad, width - photoX - pad, height - 2 * pad, 16);
      bg.clip();
      this.photo(photoX, pad, width - photoX - pad, height - 2 * pad);
      bg.restore();
    }
    header.draw(pad, Math.max(pad, (height - header.height) / 2));
    if (qr) {
      // Bottom right on the photo; inside the frame where the photo has one
      const inset = framed ? pad + 24 : pad;
      qr.draw(width - inset - cardWidth, height - inset - qr.height);
    }
    if (design === 'playful') this.sticker(photoX + 110, pad + 80);
    return fits;
  }

  // ---- Parts ----

  /** Kicker pill, title, date and place */
  private header(
    width: number,
    options: { color: string; muted: string; kicker?: boolean; center?: boolean }
  ): Measured {
    const { s, theme, spec } = this;
    const { content } = spec;
    const parts: Measured[] = [];
    if (options.kicker && content.kicker.trim()) {
      const kicker = this.kicker(options.center ? width : undefined);
      parts.push({ height: kicker.height + 22 * s, draw: kicker.draw });
    }
    const title = this.paragraph(content.title, width, {
      size: this.titleSize(width),
      weight: theme.font === 'round' ? 700 : 800,
      color: options.color,
      lineHeight: 1.08,
      align: options.center ? 'center' : 'left',
    });
    parts.push(title);
    const lines = [content.dateLine, content.placeLine].filter((line) => line.trim());
    lines.forEach((line, index) => {
      const gap = (index === 0 ? 20 : 6) * s;
      const p = this.paragraph(line, width, {
        size: (index === 0 ? 34 : 28) * s,
        weight: index === 0 ? 700 : 400,
        color: index === 0 ? options.color : options.muted,
        align: options.center ? 'center' : 'left',
      });
      parts.push({ height: p.height + gap, draw: (x, y) => p.draw(x, y + gap) });
    });
    return stack(parts, 0);
  }

  /** The largest title size up to which it takes three lines at most */
  private titleSize(width: number): number {
    const { s, theme, spec } = this;
    // Big already: with spare room the body text grows, the title only a little
    const max = (this.tall ? 104 : 92) * Math.min(s, 1.1);
    const maxLines = this.tall ? 4 : this.wide ? 2 : 3;
    for (let size = max; size > 40 * s; size -= 4 * s) {
      const style = { family: theme.font, weight: 800, size, color: DARK };
      if (wrap(this.fg, spec.content.title, width, style).length <= maxLines) return size;
    }
    return 40 * s;
  }

  private kicker(centerWidth?: number): Measured {
    const { fg, s, spec, theme } = this;
    const text = spec.content.kicker.trim().toUpperCase();
    if (!text) return NOTHING;
    const classic = spec.design === 'classic';
    const style: TextStyle = {
      family: theme.font,
      weight: 700,
      size: 24 * s,
      color: classic ? spec.color : '#ffffff',
    };
    const textWidth = fg.measure(text, style);
    const padX = 22 * s;
    const h = style.size + 26 * s;
    const background = classic ? '#ffffff' : spec.design === 'eco' ? DARK : spec.color;
    return {
      height: h,
      draw: (x, y) => {
        const left = centerWidth ? x + (centerWidth - textWidth - 2 * padX) / 2 : x;
        fg.roundRect(left, y, textWidth + 2 * padX, h, h / 2, background);
        fg.text(text, left + padX, y + h / 2 + style.size * 0.36, style);
      },
    };
  }

  /** Blocks in one or two columns, then the QR code with its caption */
  private cardContent(width: number, options: { cards?: boolean } = {}): Measured {
    const { s } = this;
    const cardPad = options.cards ? 28 * s : 0;
    const gap = options.cards ? 24 * s : 40 * s;
    const canSplit = width >= 700 && this.blocks.length > 1 && !this.tall;
    const single = this.blockParts(width, cardPad, !!options.cards);
    const parts: Measured[] = [];
    if (canSplit) {
      // Two columns only when they come out about even, else one saves more room
      const columnWidth = (width - gap) / 2;
      const split = columns(
        this.blockParts(columnWidth, cardPad, !!options.cards),
        columnWidth,
        gap
      );
      const one = stack(single, gap);
      parts.push(split.height <= one.height * 0.72 ? split : one);
    } else if (single.length > 0) {
      parts.push(stack(single, gap));
    }
    parts.push(this.qr(width, { card: options.cards }) ?? this.footer(width));
    return stack(parts, gap);
  }

  private blockParts(columnWidth: number, cardPad: number, cards: boolean): Measured[] {
    return this.blocks.map((block) => {
      const m = this.block(block, columnWidth - 2 * cardPad);
      if (!cards) return m;
      return {
        height: m.height + 2 * cardPad,
        draw: (x: number, y: number) => {
          this.fg.roundRect(x, y, columnWidth, m.height + 2 * cardPad, 26, '#ffffff');
          m.draw(x + cardPad, y + cardPad);
        },
      };
    });
  }

  private block(block: PromoBlock, width: number): Measured {
    const { s, theme } = this;
    const parts: Measured[] = [];
    if (block.title.trim()) {
      const title = this.paragraph(block.title, width, {
        size: 31 * s,
        weight: 700,
        color: theme.accent,
      });
      parts.push({ height: title.height + 10 * s, draw: title.draw });
    }
    for (const line of block.text.split('\n')) {
      parts.push(this.line(line, width));
    }
    return stack(parts, 0);
  }

  /** One line of a block: numbered step, bullet, gap or plain text */
  private line(line: string, width: number): Measured {
    const { fg, s, theme } = this;
    const size = 24 * s;
    const trimmed = line.trim();
    if (!trimmed) return { height: 12 * s, draw: () => undefined };
    const step = trimmed.match(/^(\d{1,2})[.)]\s+(.*)$/);
    const bullet = trimmed.match(/^[-•*]\s+(.*)$/);
    const indent = step ? 46 * s : bullet ? 30 * s : 0;
    const text = step ? step[2]! : bullet ? bullet[1]! : trimmed;
    const p = this.paragraph(text, width - indent, { size, weight: 400, color: theme.text });
    const gap = step || bullet ? 10 * s : 4 * s;
    return {
      height: p.height + gap,
      draw: (x, y) => {
        const mid = y + size * 0.62;
        if (step) {
          fg.circle(x + 16 * s, mid, 16 * s, theme.accent);
          fg.text(
            step[1]!,
            x + 16 * s,
            mid + 7 * s,
            { family: theme.font, weight: 700, size: 19 * s, color: '#ffffff' },
            { align: 'center' }
          );
        } else if (bullet) {
          fg.circle(x + 8 * s, mid, 6 * s, theme.accent);
        }
        p.draw(x + indent, y);
      },
    };
  }

  /** QR code with its caption and the site line below */
  private qr(width: number, options: { card?: boolean; compact?: boolean } = {}): Measured | null {
    const { fg, s, spec, theme } = this;
    if (!spec.content.qr.enabled || !spec.qrUrl) return null;
    const size = options.compact
      ? Math.min(180 * Math.min(s, 1.1), width * 0.3)
      : Math.min(230 * Math.min(s, 1.1), width * 0.32);
    const gap = 32 * s;
    const boxPad = options.card ? 28 * s : 0;
    const textWidth = width - size - gap - 2 * boxPad;
    const caption = this.paragraph(spec.content.qr.caption, textWidth, {
      size: 32 * s,
      weight: 700,
      color: theme.text,
    });
    const footer = this.footer(textWidth);
    const text = stack([caption, footer], 10 * s);
    const height = Math.max(size, text.height) + 2 * boxPad;
    return {
      height,
      draw: (x, y) => {
        if (options.card) fg.roundRect(x, y, width, height, 26, '#ffffff');
        const qx = x + boxPad;
        const qy = y + (height - size) / 2;
        drawQr(fg, spec.qrUrl, qx, qy, size);
        text.draw(qx + size + gap, y + (height - text.height) / 2);
      },
    };
  }

  /** "Alle Infos auf BazarPro.de" */
  private footer(width: number): Measured {
    const { spec, s, theme } = this;
    if (!spec.footer.trim()) return NOTHING;
    return this.paragraph(spec.footer, width, {
      size: 22 * s,
      weight: 400,
      color: theme.muted,
    });
  }

  /** Wrapped text */
  private paragraph(
    text: string,
    width: number,
    style: {
      size: number;
      weight: number;
      color: string;
      family?: FontFamily;
      lineHeight?: number;
      align?: 'left' | 'center';
    }
  ): Measured {
    const { fg, theme } = this;
    const font: TextStyle = {
      family: style.family ?? theme.font,
      weight: style.weight,
      size: style.size,
      color: style.color,
    };
    const lines = wrap(fg, text, width, font);
    const lineHeight = style.size * (style.lineHeight ?? 1.32);
    return {
      height: lines.length * lineHeight,
      draw: (x, y) => {
        const center = style.align === 'center';
        lines.forEach((line, i) => {
          fg.text(line, center ? x + width / 2 : x, y + i * lineHeight + style.size * 0.95, font, {
            align: center ? 'center' : 'left',
          });
        });
      },
    };
  }

  /** The photo, filling the box like CSS object-fit: cover */
  private photo(x: number, y: number, w: number, h: number) {
    const { spec } = this;
    const bg = this.canvas;
    const image = spec.image as (CanvasImageSource & { width: number; height: number }) | null;
    if (!image || !image.width) {
      bg.fillStyle = tint(spec.color, 0.5);
      bg.fillRect(x, y, w, h);
      return;
    }
    const scale = Math.max(w / image.width, h / image.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (image.width - sw) / 2;
    const sy = ((image.height - sh) * spec.imageFocus) / 100;
    bg.drawImage(image, sx, sy, sw, sh, x, y, w, h);
  }

  /** Black gradient over the photo, so white text stays readable */
  private shade(
    x: number,
    y: number,
    w: number,
    h: number,
    direction: 'vertical' | 'horizontal',
    stops: [number, number][]
  ) {
    const bg = this.canvas;
    const gradient =
      direction === 'vertical'
        ? bg.createLinearGradient(0, y, 0, y + h)
        : bg.createLinearGradient(x, 0, x + w, 0);
    for (const [at, alpha] of stops) gradient.addColorStop(at, `rgba(0,0,0,${alpha})`);
    bg.fillStyle = gradient;
    bg.fillRect(x, y, w, h);
  }

  /** Photo in a white frame, turned a little */
  private framedPhoto(x: number, y: number, w: number, h: number, angle: number) {
    const bg = this.canvas;
    bg.save();
    bg.translate(x + w / 2, y + h / 2);
    bg.rotate(angle);
    bg.fillStyle = '#ffffff';
    bg.beginPath();
    bg.roundRect(-w / 2 - 12, -h / 2 - 12, w + 24, h + 24, 44);
    bg.fill();
    bg.beginPath();
    bg.roundRect(-w / 2, -h / 2, w, h, 34);
    bg.clip();
    this.photo(-w / 2, -h / 2, w, h);
    bg.restore();
  }

  /** Pastel page with a few dots of the accent color in the margins */
  private playfulBackground() {
    const { width, height, spec, theme } = this;
    const bg = this.canvas;
    bg.fillStyle = theme.background;
    bg.fillRect(0, 0, width, height);
    const dots = [
      [0.028, 0.42, 12],
      [0.972, 0.5, 15],
      [0.972, 0.82, 10],
      [0.028, 0.7, 8],
    ];
    bg.fillStyle = tint(spec.color, 0.45);
    for (const [fx, fy, r] of dots) {
      bg.beginPath();
      bg.arc(fx! * width, fy! * height, r!, 0, Math.PI * 2);
      bg.fill();
    }
  }

  /** Round date badge of the playful design: "SA / 18 / NOV" */
  private sticker(cx: number, cy: number) {
    const { fg, s, spec, theme } = this;
    const words = spec.content.dateLine.split(/[\s,·]+/).filter(Boolean);
    const day = words.find((w) => /^\d{1,2}\.?$/.test(w));
    if (!day) return;
    const weekday = words[0]!.slice(0, 2).toUpperCase();
    const month = words[words.indexOf(day) + 1]?.slice(0, 3).toUpperCase() ?? '';
    const r = 92 * s;
    const angle = 0.12;
    const x0 = cx - r * 0.4;
    const y0 = cy - r * 0.2;
    fg.circle(x0, y0, r, spec.color, { color: '#ffffff', width: 8 * s });
    // A line `dy` below the centre, turned with the badge
    const line = (text: string, dy: number, size: number, weight: number) =>
      fg.text(
        text,
        x0 - dy * Math.sin(angle),
        y0 + dy * Math.cos(angle),
        { family: theme.font, weight, size, color: '#ffffff' },
        { align: 'center', angle }
      );
    line(weekday, -36 * s, 24 * s, 600);
    line(day.replace('.', ''), 22 * s, 62 * s, 700);
    line(month, 54 * s, 24 * s, 600);
  }
}

function stack(parts: Measured[], gap: number): Measured {
  const visible = parts.filter((p) => p.height > 0);
  const height =
    visible.reduce((sum, p) => sum + p.height, 0) + gap * Math.max(0, visible.length - 1);
  return {
    height,
    draw: (x, y) => {
      let top = y;
      for (const part of visible) {
        part.draw(x, top);
        top += part.height + gap;
      }
    },
  };
}

/** Blocks in reading order down two columns, split where the columns are most even */
function columns(parts: Measured[], columnWidth: number, gap: number): Measured {
  let best = { split: 1, height: Infinity };
  for (let split = 1; split < parts.length; split++) {
    const height = Math.max(
      stack(parts.slice(0, split), gap).height,
      stack(parts.slice(split), gap).height
    );
    if (height < best.height) best = { split, height };
  }
  const left = stack(parts.slice(0, best.split), gap);
  const right = stack(parts.slice(best.split), gap);
  return {
    height: best.height,
    draw: (x, y) => {
      left.draw(x, y);
      right.draw(x + columnWidth + gap, y);
    },
  };
}

/** Lines of `text` no wider than `width`; words longer than a line are cut */
export function wrap(painter: Painter, text: string, width: number, style: TextStyle): string[] {
  const fits = (candidate: string) => painter.measure(candidate, style) <= width;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (!fits(line) && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && !fits(line.slice(0, cut))) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawQr(painter: Painter, text: string, x: number, y: number, size: number) {
  const { total, runs } = qrRuns(screenQr(text));
  const module = size / total;
  painter.rect(x, y, size, size, '#ffffff');
  for (const run of runs) {
    // A hair larger than the module, so viewers show no seams between rows
    painter.rect(
      x + run.x * module,
      y + run.y * module,
      run.width * module + 0.3,
      module + 0.3,
      '#000000'
    );
  }
}

/** `color` mixed with white as #rrggbb; amount 1 is white */
export function tint(color: string, amount: number): string {
  const n = parseInt(color.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const hex = (c: number) => mix(c).toString(16).padStart(2, '0');
  return `#${hex((n >> 16) & 255)}${hex((n >> 8) & 255)}${hex(n & 255)}`;
}
