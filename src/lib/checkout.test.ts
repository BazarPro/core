import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetAudioContext,
  clearCachedCart,
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
