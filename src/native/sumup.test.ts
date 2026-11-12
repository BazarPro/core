import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: 'android',
  plugin: {
    setup: vi.fn(async () => {}),
    status: vi.fn(async () => ({ loggedIn: true, merchantCode: 'MH4H92C7' })),
    login: vi.fn(async () => ({ loggedIn: true })),
    logout: vi.fn(async () => {}),
    openReaderSettings: vi.fn(async () => {}),
    prepareForCheckout: vi.fn(async () => {}),
    tapToPayStatus: vi.fn(async () => ({ available: true, activated: false })),
    activateTapToPay: vi.fn(async () => ({ activated: true })),
    checkout: vi.fn(async () => ({ status: 'successful', transactionCode: 'TEENSK4W2K' })),
  },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    isPluginAvailable: () => true,
    getPlatform: () => native.platform,
  },
  registerPlugin: () => native.plugin,
}));

/** The module keeps the SDK's setup per app start; each test is a new start. */
async function load() {
  vi.resetModules();
  return import('./sumup');
}

describe('useSumUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    native.platform = 'android';
    vi.stubEnv('VITE_SUMUP_AFFILIATE_KEY', 'sup_afk_test');
    vi.stubEnv('VITE_SUMUP_TAP_TO_PAY', '');
  });

  it('stays off while the event takes no cards, or without the affiliate key', async () => {
    const { useSumUp } = await load();
    const { result } = renderHook(() => useSumUp(false));
    expect(result.current.available).toBe(false);
    vi.stubEnv('VITE_SUMUP_AFFILIATE_KEY', '');
    const { result: noKey } = renderHook(() => useSumUp(true));
    expect(noKey.current.available).toBe(false);
    expect(native.plugin.setup).not.toHaveBeenCalled();
  });

  it('sets the SDK up once and charges the total with two decimals', async () => {
    const { useSumUp } = await load();
    const { result } = renderHook(() => useSumUp(true));
    await waitFor(() => expect(result.current.loggedIn).toBe(true));
    expect(result.current.merchantCode).toBe('MH4H92C7');
    expect(native.plugin.setup).toHaveBeenCalledWith({ affiliateKey: 'sup_afk_test' });

    let outcome;
    await act(async () => {
      outcome = await result.current.charge({
        total: 0.1 + 0.2 + 12,
        foreignTransactionId: 'sale-1',
        title: 'Kinderbasar',
      });
    });
    expect(native.plugin.checkout).toHaveBeenCalledWith({
      amount: '12.30',
      foreignTransactionId: 'sale-1',
      title: 'Kinderbasar',
      tapToPay: false,
    });
    expect(outcome).toEqual({ status: 'successful', transactionCode: 'TEENSK4W2K' });
    expect(native.plugin.setup).toHaveBeenCalledTimes(1);
    // Android has no Tap to Pay in this app
    expect(native.plugin.tapToPayStatus).not.toHaveBeenCalled();
  });

  it('on an iPhone with the entitlement activates Tap to Pay before the first payment', async () => {
    native.platform = 'ios';
    vi.stubEnv('VITE_SUMUP_TAP_TO_PAY', 'true');
    const { useSumUp } = await load();
    const { result } = renderHook(() => useSumUp(true));
    await waitFor(() => expect(result.current.tapToPay.available).toBe(true));
    expect(result.current.tapToPay.selected).toBe(false);

    act(() => result.current.selectTapToPay(true));
    expect(result.current.tapToPay.selected).toBe(true);
    await act(async () => {
      await result.current.charge({ total: 5, foreignTransactionId: 'sale-2' });
    });
    expect(native.plugin.activateTapToPay).toHaveBeenCalled();
    expect(native.plugin.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '5.00', tapToPay: true })
    );
    // The choice is the device's
    expect(localStorage.getItem('bazarpro.sumup.tapToPay')).toBe('true');
  });

  it('charges nothing when the cashier cancels the Tap to Pay activation', async () => {
    native.platform = 'ios';
    vi.stubEnv('VITE_SUMUP_TAP_TO_PAY', 'true');
    localStorage.setItem('bazarpro.sumup.tapToPay', 'true');
    native.plugin.activateTapToPay.mockResolvedValueOnce({ activated: false });
    const { useSumUp } = await load();
    const { result } = renderHook(() => useSumUp(true));
    await waitFor(() => expect(result.current.tapToPay.selected).toBe(true));
    let outcome;
    await act(async () => {
      outcome = await result.current.charge({ total: 5, foreignTransactionId: 'sale-3' });
    });
    expect(outcome).toEqual({ status: 'failed', code: 'tapToPayActivation' });
    expect(native.plugin.checkout).not.toHaveBeenCalled();
  });
});
