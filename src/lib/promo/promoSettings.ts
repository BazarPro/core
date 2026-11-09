import {
  defaultPromoContent,
  PROMO_AUDIENCES,
  PROMO_BLOCKS,
  type PromoBlock,
  type PromoContent,
  type PromoEvent,
} from './promoContent';
import {
  PROMO_COLORS,
  PROMO_DESIGNS,
  PROMO_FORMATS,
  type PromoDesign,
  type PromoFormatId,
} from './renderPromo';

/**
 * What the promo page stores with the bazaar (promos.savePromo): the choices and texts,
 * not the pictures. Read back defensively: older versions and other app versions may
 * miss fields or know other formats.
 */

export interface PromoSettings {
  format: PromoFormatId;
  design: PromoDesign;
  color: string;
  imageFocus: number;
  content: PromoContent;
}

export function defaultPromoSettings(event: PromoEvent): PromoSettings {
  return {
    format: 'poster',
    design: 'photo',
    color: PROMO_COLORS[0]!,
    imageFocus: 50,
    content: defaultPromoContent(event, 'visitors'),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/** The stored settings over the defaults of the bazaar; unknown values fall back. */
export function restorePromoSettings(saved: unknown, event: PromoEvent): PromoSettings {
  const fallback = defaultPromoSettings(event);
  if (!isRecord(saved)) return fallback;
  const content = isRecord(saved.content) ? saved.content : {};
  const audience = PROMO_AUDIENCES.find((a) => a === content.audience) ?? 'visitors';
  const defaults = defaultPromoContent(event, audience);
  const savedBlocks = isRecord(content.blocks) ? content.blocks : {};
  const blocks = {} as Record<(typeof PROMO_BLOCKS)[number], PromoBlock>;
  for (const id of PROMO_BLOCKS) {
    const block = isRecord(savedBlocks[id]) ? savedBlocks[id] : {};
    const base = defaults.blocks[id];
    blocks[id] = {
      enabled: flag(block.enabled, base.enabled),
      title: text(block.title, base.title),
      text: text(block.text, base.text),
      back: flag(block.back, base.back),
    };
  }
  const qr = isRecord(content.qr) ? content.qr : {};
  const focus = Number(saved.imageFocus);
  return {
    format:
      (Object.keys(PROMO_FORMATS) as PromoFormatId[]).find((f) => f === saved.format) ??
      fallback.format,
    design: PROMO_DESIGNS.find((d) => d === saved.design) ?? fallback.design,
    color:
      typeof saved.color === 'string' && /^#[0-9a-f]{6}$/i.test(saved.color)
        ? saved.color
        : fallback.color,
    imageFocus: Number.isFinite(focus) ? Math.min(100, Math.max(0, focus)) : 50,
    content: {
      audience,
      kicker: text(content.kicker, defaults.kicker),
      title: text(content.title, defaults.title),
      dateLine: text(content.dateLine, defaults.dateLine),
      placeLine: text(content.placeLine, defaults.placeLine),
      blocks,
      qr: {
        enabled: flag(qr.enabled, defaults.qr.enabled),
        caption: text(qr.caption, defaults.qr.caption),
      },
    },
  };
}
