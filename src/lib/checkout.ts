import type { Id } from '../../convex/_generated/dataModel';

export type PriceChoice = 'list' | 'negotiated' | Id<'productOffers'>;

export interface CartEntry {
  productId: Id<'products'>;
  choice: PriceChoice;
  negotiatedInput: string;
}

const CHECKOUT_SOUND_STORAGE_KEY = 'bazarpro:checkout:sound-enabled';

/** Product id from a scanned label (URL of the product page) or a typed id. */
export function productIdFromCode(code: string): string | null {
  const value = code.trim();
  const match = value.match(/\/products\/view\/([a-z0-9]+)/i);
  if (match) return match[1];
  return /^[a-z0-9]{16,}$/i.test(value) ? value : null;
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

export function clearCachedCart(eventId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getCheckoutCartStorageKey(eventId));
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
