import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetAudioContext,
  clearCachedCart,
  commissionOf,
  parseAmount,
  deskCommissions,
  deskTakes,
  getCheckoutCartStorageKey,
  getCheckoutSoundEnabled,
  loadCachedCart,
  playScanBeep,
  productIdFromCode,
  saveCachedCart,
  setCheckoutSoundEnabled,
} from './checkout';

describe('checkout utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetAudioContext();
  });

  afterEach(() => {
    _resetAudioContext();
    vi.restoreAllMocks();
  });

  describe('productIdFromCode', () => {
    it('reads the id from a label URL or a typed id', () => {
      expect(productIdFromCode('https://basar.de/products/view/abc123def456ghi789')).toBe(
        'abc123def456ghi789'
      );
      expect(productIdFromCode(' abc123def456ghi789 ')).toBe('abc123def456ghi789');
      expect(productIdFromCode('bazarpro://user/token')).toBeNull();
      expect(productIdFromCode('https://basar.de/products/view/abc123')).toBeNull();
    });

    it('reads the UUIDs of the Rust backend whole, not up to the first dash', () => {
      const id = '0199f2a4-7c1e-7b3a-9d2e-5f6a7b8c9d0e';
      expect(productIdFromCode(`https://review-147.bazarpro.de/products/view/${id}`)).toBe(id);
      expect(productIdFromCode(`https://basar.de/products/view/${id}?ref=qr`)).toBe(id);
      expect(productIdFromCode(` ${id.toUpperCase()} `)).toBe(id);
      expect(productIdFromCode('0199f2a4')).toBeNull();
    });

    it('reads the short links of the labels, in upper case for the QR alphanumeric mode', () => {
      const id = '0199f2a4-7c1e-7b3a-9d2e-5f6a7b8c9d0e';
      expect(productIdFromCode(`HTTPS://BAZARPRO.DE/P/${id.toUpperCase()}`)).toBe(id);
      expect(productIdFromCode(`https://verein.example/p/${id}`)).toBe(id);
      // Convex ids keep their case
      expect(productIdFromCode('https://basar.de/p/abc123def456ghi789')).toBe('abc123def456ghi789');
      expect(productIdFromCode('https://basar.de/shop/p/kurz')).toBeNull();
      expect(productIdFromCode('12')).toBeNull();
    });
  });

  describe('cart caching', () => {
    it('saves, loads, and clears the cart cache for an event', () => {
      const key = getCheckoutCartStorageKey('evt1');
      expect(loadCachedCart('evt1')).toEqual([]);

      const sampleCart = [
        {
          productId: 'p1' as never,
          choice: 'list' as const,
          negotiatedInput: '',
        },
        {
          productId: 'p2' as never,
          choice: 'negotiated' as const,
          negotiatedInput: '15.50',
        },
      ];

      saveCachedCart('evt1', sampleCart);
      expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleCart));

      const loaded = loadCachedCart('evt1');
      expect(loaded).toEqual(sampleCart);

      clearCachedCart('evt1');
      expect(localStorage.getItem(key)).toBeNull();
      expect(loadCachedCart('evt1')).toEqual([]);
    });

    it('ignores invalid or corrupted cached JSON', () => {
      const key = getCheckoutCartStorageKey('evt1');
      localStorage.setItem(key, '{ not valid json');
      expect(loadCachedCart('evt1')).toEqual([]);

      localStorage.setItem(key, JSON.stringify('not an array'));
      expect(loadCachedCart('evt1')).toEqual([]);

      localStorage.setItem(
        key,
        JSON.stringify([
          { invalid: true },
          { productId: 'p1', choice: 'list', negotiatedInput: '' },
        ])
      );
      expect(loadCachedCart('evt1')).toEqual([
        { productId: 'p1', choice: 'list', negotiatedInput: '' },
      ]);
    });
  });

  describe('sound preferences', () => {
    it('defaults to true when unset', () => {
      expect(getCheckoutSoundEnabled()).toBe(true);
    });

    it('persists enabled and disabled state in localStorage', () => {
      setCheckoutSoundEnabled(false);
      expect(getCheckoutSoundEnabled()).toBe(false);

      setCheckoutSoundEnabled(true);
      expect(getCheckoutSoundEnabled()).toBe(true);
    });
  });

  describe('playScanBeep', () => {
    it('safely runs without throwing when AudioContext is unavailable', () => {
      expect(() => playScanBeep()).not.toThrow();
    });

    it('creates and starts oscillator when AudioContext is supported', () => {
      const startFn = vi.fn();
      const stopFn = vi.fn();
      const connectFn = vi.fn();
      const setValueAtTimeFn = vi.fn();
      const exponentialRampToValueAtTimeFn = vi.fn();

      const mockGain = {
        gain: {
          setValueAtTime: setValueAtTimeFn,
          exponentialRampToValueAtTime: exponentialRampToValueAtTimeFn,
        },
        connect: connectFn,
      };

      const mockOsc = {
        type: 'sine',
        frequency: { setValueAtTime: setValueAtTimeFn },
        connect: connectFn,
        start: startFn,
        stop: stopFn,
      };

      class MockAudioContext {
        currentTime = 10;
        destination = {};
        state = 'suspended';
        resume = vi.fn().mockResolvedValue(undefined);
        createOscillator() {
          return mockOsc;
        }
        createGain() {
          return mockGain;
        }
      }

      vi.stubGlobal('AudioContext', MockAudioContext);

      playScanBeep();

      expect(startFn).toHaveBeenCalled();
      expect(stopFn).toHaveBeenCalledWith(10.1);
      expect(setValueAtTimeFn).toHaveBeenCalledWith(1046, 10);
      expect(connectFn).toHaveBeenCalled();
    });
  });
});

describe('checkout storage failures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('ignores broken or blocked storage', () => {
    localStorage.setItem(getCheckoutCartStorageKey('e1'), '{"not":"a list"}');
    expect(loadCachedCart('e1')).toEqual([]);
    localStorage.setItem(getCheckoutCartStorageKey('e1'), 'not json');
    expect(loadCachedCart('e1')).toEqual([]);

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getCheckoutSoundEnabled()).toBe(true);
    expect(() => setCheckoutSoundEnabled(false)).not.toThrow();
    expect(() => saveCachedCart('e1', [])).not.toThrow();
    expect(() => clearCachedCart('e1')).not.toThrow();
  });

  it('stays silent without Web Audio', () => {
    _resetAudioContext();
    vi.stubGlobal('AudioContext', undefined);
    expect(() => playScanBeep()).not.toThrow();
  });
});

describe('what the desk takes', () => {
  it('rounds the commission like the backend, halves up', () => {
    // Floats put these just below the half cent: 4.1 * 15 = 61.49999…
    expect(commissionOf(4.1, 15)).toBe(0.62);
    expect(commissionOf(16.9, 15)).toBe(2.54);
    expect(commissionOf(33.3, 15)).toBe(5);
    expect(commissionOf(1.25, 10)).toBe(0.13);
    expect(commissionOf(250, 10)).toBe(25);
    expect(commissionOf(19.99, 12.5)).toBe(2.5);
    expect(commissionOf(0.01, 10)).toBe(0);
    expect(commissionOf(80, 0)).toBe(0);
  });

  it('is the prices, at a direct sale the commission of each item', () => {
    expect(deskTakes([250, 190], false, 10)).toBe(440);
    expect(deskTakes([250, 190], true, 10)).toBe(44);
    // Each item rounds on its own, as each is booked on its own
    expect(deskTakes([4.1, 4.1], true, 15)).toBe(1.24);
    expect(deskTakes([0.1, 0.2], false, 10)).toBe(0.3);
    expect(deskTakes([], true, 10)).toBe(0);
  });

  it('shares the rest of the fee cap among the items of a seller', () => {
    const lines = [
      { price: 140, sellerId: 'anna', feeCapLeft: 20 },
      { price: 90, sellerId: 'ben', feeCapLeft: 20 },
      { price: 90, sellerId: 'anna', feeCapLeft: 20 },
      { price: 50, sellerId: 'anna', feeCapLeft: 20 },
    ];
    // Anna: 14 €, then the rest of 6 €, then nothing; Ben is on his own
    expect(deskCommissions(lines, 10)).toEqual([14, 9, 6, 0]);
    // Without a cap every item pays its commission
    expect(deskCommissions([{ price: 140 }, { price: 90 }], 10)).toEqual([14, 9]);
  });

  it("takes the commission of the seller's fee group", () => {
    expect(deskCommissions([{ price: 140, commissionPercent: 5 }, { price: 90 }], 10)).toEqual([
      7, 9,
    ]);
  });
});

describe('parseAmount', () => {
  it('reads what a helper types for the money handed over', () => {
    expect(parseAmount('20')).toBe(20);
    expect(parseAmount('20,5')).toBe(20.5);
    expect(parseAmount('20.50')).toBe(20.5);
    expect(parseAmount(' 50 € ')).toBe(50);
    expect(parseAmount('20,-')).toBe(20);
    expect(parseAmount('1.000')).toBe(1000);
    expect(parseAmount('1.000,50')).toBe(1000.5);
  });

  it('is null for what is no amount yet', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('20,555')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
  });
});
