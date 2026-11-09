import i18n from '../../i18n';
import { serviceLabel } from '../../i18n/services';
import { formatBerlinDate, formatBerlinTime } from '../../shared/berlinTime';
import { formatPriceDE } from '../utils';
import { formatEventPlace } from '../../shared/eventJsonLd';

/**
 * What goes on a flyer, poster or social media picture of a bazaar: filled in from the
 * bazaar, then changed by the organizer. Only texts, the drawing is in renderPromo.
 */

export const PROMO_AUDIENCES = ['visitors', 'sellers', 'helpers'] as const;
export type PromoAudience = (typeof PROMO_AUDIENCES)[number];

/** In the order they appear on the picture */
export const PROMO_BLOCKS = ['offer', 'sell', 'labels', 'help', 'arrival', 'contact'] as const;
export type PromoBlockId = (typeof PROMO_BLOCKS)[number];

export interface PromoBlock {
  enabled: boolean;
  title: string;
  /** Lines; "1. …" become numbered steps, "- …" bullets */
  text: string;
  /** On the back of a flyer; other formats have one side */
  back: boolean;
}

type BlockText = Pick<PromoBlock, 'title' | 'text'>;

export interface PromoContent {
  audience: PromoAudience;
  /** Small line above the title, e.g. "Helfer gesucht!" */
  kicker: string;
  title: string;
  dateLine: string;
  placeLine: string;
  blocks: Record<PromoBlockId, PromoBlock>;
  qr: { enabled: boolean; caption: string };
}

/** The fields of a bazaar the texts are made of (api.events.getEvent) */
export interface PromoEvent {
  title: string;
  description: string;
  location: string;
  street?: string;
  postalCode?: string;
  city?: string;
  startDate: number;
  endDate: number;
  contactInfo: string;
  services: string[];
  commission: number;
  categoryLabels: string[];
  features?: { labelMark?: string; intakeFee?: number; maxItemsPerSeller?: number };
  sellerLogistics?: {
    dropoffStart?: number;
    dropoffEnd?: number;
    pickupStart?: number;
    pickupEnd?: number;
  };
}

/** On a flyer the long instructions go on the back, what draws visitors stays in front */
const ON_BACK: PromoBlockId[] = ['sell', 'labels', 'help', 'contact'];

/** Which blocks each audience sees at first */
const PRESETS: Record<PromoAudience, PromoBlockId[]> = {
  visitors: ['offer', 'arrival'],
  sellers: ['sell', 'labels', 'contact'],
  helpers: ['help', 'contact'],
};

const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(`promo.content.${key}` as never, { ns: 'organizer', ...options }) as string;

const locale = () => (i18n.resolvedLanguage === 'en' ? 'en' : 'de');

/** "Samstag, 18. November 2026" or, over several days, "18. – 20. November 2026" */
export function promoDateLine(event: Pick<PromoEvent, 'startDate' | 'endDate'>): string {
  const start = formatBerlinDate(event.startDate, locale());
  const end = formatBerlinDate(event.endDate, locale());
  if (start !== end) return `${start} – ${end}`;
  const hours = t('hours', {
    from: formatBerlinTime(event.startDate),
    to: formatBerlinTime(event.endDate),
  });
  return `${start} · ${hours}`;
}

function timeRange(start?: number, end?: number): string {
  if (start === undefined) return '';
  const day = formatBerlinDate(start, locale());
  const from = formatBerlinTime(start);
  if (end === undefined) return t('timeFrom', { day, from });
  const sameDay = formatBerlinDate(end, locale()) === day;
  if (!sameDay)
    return `${day}, ${from} – ${formatBerlinDate(end, locale())}, ${formatBerlinTime(end)}`;
  return t('timeRange', { day, from, to: formatBerlinTime(end) });
}

export function promoPlaceLine(event: PromoEvent): string {
  return formatEventPlace(event);
}

function blockTexts(event: PromoEvent): Record<PromoBlockId, BlockText> {
  const food = event.services.filter((s) => s !== 'Parkplatz' && s !== 'Skiservice');
  const offerLines = [
    event.categoryLabels.length > 0
      ? event.categoryLabels.join(' · ')
      : (event.description.split(/(?<=[.!?])\s/)[0] ?? ''),
  ];
  if (food.length > 0) {
    offerLines.push(t('offer.food', { services: food.map(serviceLabel).join(', ') }));
  }
  if (event.services.includes('Skiservice')) offerLines.push(t('offer.skiService'));

  const { dropoffStart, dropoffEnd, pickupStart, pickupEnd } = event.sellerLogistics ?? {};
  const max = event.features?.maxItemsPerSeller;
  const sellSteps = [
    t('sell.register'),
    max ? t('sell.itemsMax', { count: max }) : t('sell.items'),
    t('sell.labels'),
    dropoffStart
      ? t('sell.dropoffAt', { time: timeRange(dropoffStart, dropoffEnd) })
      : t('sell.dropoff'),
    pickupStart
      ? t('sell.pickupAt', { time: timeRange(pickupStart, pickupEnd) })
      : t('sell.pickup'),
  ];
  const fee = event.features?.intakeFee;
  const terms = fee
    ? t('sell.termsWithFee', { commission: event.commission, fee: formatPriceDE(fee) })
    : t('sell.terms', { commission: event.commission });

  // The address is already under the title: here only how to get there
  const parking = event.services.includes('Parkplatz');

  return {
    offer: { title: t('offer.title'), text: offerLines.filter(Boolean).join('\n') },
    sell: {
      title: t('sell.title'),
      text: [...sellSteps.map((step, i) => `${i + 1}. ${step}`), '', terms].join('\n'),
    },
    labels: { title: t('labels.title'), text: t('labels.text') },
    help: {
      title: t('help.title'),
      text: [
        t('help.intro'),
        '',
        `1. ${t('help.step1')}`,
        `2. ${t('help.step2')}`,
        `3. ${t('help.step3')}`,
      ].join('\n'),
    },
    arrival: {
      title: t('arrival.title'),
      text: parking ? t('arrival.parking') : t('arrival.unknown'),
    },
    contact: { title: t('contact.title'), text: event.contactInfo.trim() },
  };
}

/** Everything filled in from the bazaar, with the blocks of the audience switched on. */
export function defaultPromoContent(event: PromoEvent, audience: PromoAudience): PromoContent {
  const texts = blockTexts(event);
  const blocks = {} as Record<PromoBlockId, PromoBlock>;
  for (const id of PROMO_BLOCKS) {
    blocks[id] = {
      ...texts[id],
      enabled: blockEnabled(event, audience, id),
      back: ON_BACK.includes(id),
    };
  }
  return {
    audience,
    kicker: t(`kicker.${audience}`),
    title: event.title,
    dateLine: promoDateLine(event),
    placeLine: promoPlaceLine(event),
    blocks,
    qr: { enabled: true, caption: t(`qr.${audience}`) },
  };
}

function blockEnabled(event: PromoEvent, audience: PromoAudience, id: PromoBlockId): boolean {
  if (id === 'labels' && event.features?.labelMark !== 'universal') return false;
  if (id === 'contact' && !event.contactInfo.trim()) return false;
  if (id === 'arrival' && !event.services.includes('Parkplatz')) return false;
  return PRESETS[audience].includes(id);
}

/**
 * Another audience: its kicker, QR caption and blocks, but the texts the organizer
 * already changed stay.
 */
export function switchAudience(
  content: PromoContent,
  event: PromoEvent,
  audience: PromoAudience
): PromoContent {
  const fresh = defaultPromoContent(event, audience);
  const blocks = { ...content.blocks };
  for (const id of PROMO_BLOCKS) blocks[id] = { ...blocks[id], enabled: fresh.blocks[id].enabled };
  return {
    ...content,
    audience,
    kicker: fresh.kicker,
    qr: { ...content.qr, caption: fresh.qr.caption },
    blocks,
  };
}

/** The default text of one block, to undo the organizer's changes */
export function defaultBlock(event: PromoEvent, id: PromoBlockId): BlockText {
  return blockTexts(event)[id];
}
