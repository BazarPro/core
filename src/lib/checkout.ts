import type { Id } from './api/types';
import { cappedCommission } from '../shared/feeCap';

export type PriceChoice = 'list' | 'negotiated' | Id<'productOffers'>;

export interface CartEntry {
  productId: Id<'products'>;
  choice: PriceChoice;
  negotiatedInput: string;
}

const CHECKOUT_SOUND_STORAGE_KEY = 'bazarpro:checkout:sound-enabled';
const CHECKOUT_CAMERA_STORAGE_KEY = 'bazarpro:checkout:camera-enabled';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** UUID of the Rust backend, or the Convex id on labels printed before (backend/src/shape.rs) */
const PRODUCT_ID = `${UUID}|[a-z0-9]{16,}`;
/** The product page, or the short link of the labels (/P/<UUID>, src/lib/labelQr.ts) */
const LABEL_URL = new RegExp(`/(?:products/view|p)/(${PRODUCT_ID})(?![a-z0-9-])`, 'i');
const TYPED_ID = new RegExp(`^(?:${PRODUCT_ID})$`, 'i');
const IS_UUID = new RegExp(`^${UUID}$`, 'i');

/** Product id from a scanned label (link to the product) or a typed id. */
export function productIdFromCode(code: string): string | null {
  const value = code.trim();
  const id = value.match(LABEL_URL)?.[1] ?? (TYPED_ID.test(value) ? value : null);
  // Labels carry UUIDs in upper case; the cart compares ids as text
  return id && IS_UUID.test(id) ? id.toLowerCase() : id;
}

export function getCheckoutCartStorageKey(eventId: string): string {
  return `bazarpro:checkout:cart:${eventId}`;
}

export function loadCachedCart(eventId: string): CartEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getCheckoutCartStorageKey(eventId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CartEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.productId === 'string' &&
        entry.productId.length > 0 &&
        typeof entry.choice === 'string' &&
        typeof entry.negotiatedInput === 'string'
    );
  } catch {
    return [];
  }
}

export function saveCachedCart(eventId: string, cart: CartEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getCheckoutCartStorageKey(eventId), JSON.stringify(cart));
  } catch {
    // Ignore storage quota or access errors
  }
}

/** An item from elsewhere in the app joins the cart of the bazaar's cash desk. */
export function addToCachedCart(eventId: string, productId: Id<'products'>): void {
  const cart = loadCachedCart(eventId);
  if (cart.some((entry) => entry.productId === productId)) return;
  saveCachedCart(eventId, [...cart, { productId, choice: 'list', negotiatedInput: '' }]);
}

export function clearCachedCart(eventId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getCheckoutCartStorageKey(eventId));
  } catch {
    // Ignore storage errors
  }
}

/** Off until asked for: the camera drains the battery and does not need to watch the desk. */
export function getCheckoutCameraEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CHECKOUT_CAMERA_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setCheckoutCameraEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHECKOUT_CAMERA_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

export function getCheckoutSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const saved = localStorage.getItem(CHECKOUT_SOUND_STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
}

export function setCheckoutSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHECKOUT_SOUND_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

let audioContextInstance: AudioContext | null = null;

export function _resetAudioContext(): void {
  audioContextInstance = null;
}

export function playScanBeep(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContextInstance || audioContextInstance.state === 'closed') {
      audioContextInstance = new AudioCtx();
    }
    if (audioContextInstance.state === 'suspended') {
      void audioContextInstance.resume();
    }
    const osc = audioContextInstance.createOscillator();
    const gain = audioContextInstance.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046, audioContextInstance.currentTime);
    gain.gain.setValueAtTime(0.15, audioContextInstance.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContextInstance.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioContextInstance.destination);
    osc.start();
    osc.stop(audioContextInstance.currentTime + 0.1);
  } catch {
    // Ignore errors from browser autoplay policies or audio failures
  }
}

/**
 * The commission of a sale as the backend books it (purchases.rs, book): the percentage
 * of the price in cents, halves rounded up. In whole numbers, because floats put e.g.
 * 15 % of 4,10 € just below the half cent.
 */
export function commissionOf(price: number, percent: number): number {
  // Prices have two decimals; six for the percentage are more than any event has
  const SCALE = 1_000_000;
  const cents = Math.round(price * 100);
  const scaled = cents * Math.round(percent * SCALE);
  const divisor = 100 * SCALE;
  return Math.floor((scaled + divisor / 2) / divisor) / 100;
}

/**
 * What the cash desk takes for items sold at `prices`: the prices, at a direct sale the
 * commission of each. The backend's rule is desk_takes (backend/src/modules/docs.rs).
 */
export function deskTakes(prices: number[], directSale: boolean, percent: number): number {
  const cents = prices.reduce(
    (sum, price) => sum + Math.round((directSale ? commissionOf(price, percent) : price) * 100),
    0
  );
  return cents / 100;
}

/** A line of the cart as far as the commission of a direct sale needs it. */
export interface CommissionLine {
  price: number;
  sellerId?: string;
  /** What is left of the seller's fee cap before this cart; unset without a cap */
  feeCapLeft?: number;
  /** The seller's commission when their fee group has its own (#302) */
  commissionPercent?: number;
}

/**
 * The commission of each line of a direct sale, as the backend books the cart: lines of
 * the same seller share the rest of the fee cap in cart order.
 */
export function deskCommissions(lines: CommissionLine[], percent: number): number[] {
  const paid = new Map<string, number>();
  return lines.map(({ price, sellerId, feeCapLeft, commissionPercent }) => {
    const commission = commissionOf(price, commissionPercent ?? percent);
    if (feeCapLeft === undefined || sellerId === undefined) return commission;
    const before = paid.get(sellerId) ?? 0;
    const capped = cappedCommission(commission, before, feeCapLeft);
    paid.set(sellerId, Math.round((before + capped) * 100) / 100);
    return capped;
  });
}

/**
 * An amount typed at the desk, or null while it is not one: "20", "20,5", "20.50",
 * "50 €", "20,-" and "1.000" (a point before three digits groups thousands).
 */
export function parseAmount(input: string): number | null {
  let text = input.replace(/[\s€]/g, '').replace(/,-$/, '');
  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  if (text === '' || !/^\d+(\.\d{0,2})?$/.test(text)) return null;
  return Number(text);
}
