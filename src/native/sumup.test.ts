import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Id } from '../lib/api/types';

const native = vi.hoisted(() => ({
  platform: 'android',
  plugin: {
    setup: vi.fn(async () => {}),
    status: vi.fn(async () => ({ loggedIn: true, merchantCode: 'MH4H92C7' })),
    login: vi.fn(async () => ({ loggedIn: true })),
    loginWithToken: vi.fn(async () => ({ loggedIn: true })),
    logout: vi.fn(async () => {}),
    openReaderSettings: vi.fn(async () => {}),
    prepareForCheckout: vi.fn(async () => {}),
    tapToPayStatus: vi.fn(async () => ({ available: true, activated: false })),
    activateTapToPay: vi.fn(async () => ({ activated: true })),
    checkout: vi.fn(
      async (): Promise<{ status: string; code?: string; transactionCode?: string }> => ({
        status: 'successful',
        transactionCode: 'TEENSK4W2K',
      })
    ),
  },
}));
/** The server: how SumUp is connected, and the desk's access tokens */
const server = vi.hoisted(() => ({
  connection: { oauth: false, connected: false, mine: true } as Record<string, unknown>,
  sumUpToken: vi.fn(async () => ({
    accessToken: 'at_1',
    expiresAt: Date.now() + 3600_000,
    merchantCode: 'MH4H92C7',
  })),
  startConnect: vi.fn(async () => ({ url: 'https://bazarpro.de/api/sumup/start?state=s' })),
}));
vi.mock('../lib/api/react', () => ({
  useApiClient: () => server,
  useOptionalQuery: (_query: unknown, args: unknown) =>
    args === 'skip' ? undefined : server.connection,
  useMutation: () => server.startConnect,
}));
const browser = vi.hoisted(() => ({ open: vi.fn(async () => {}) }));
vi.mock('@capacitor/browser', () => ({ Browser: browser }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    isPluginAvailable: () => true,
    getPlatform: () => native.platform,
  },
  registerPlugin: () => native.plugin,
}));

const EVENT = 'event1' as Id<'events'>;

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
    server.connection = { oauth: false, connected: false, mine: true };
  });

  it('stays off while the event takes no cards, or without the affiliate key', async () => {
    const { useSumUp } = await load();
    const { result } = renderHook(() => useSumUp(false, EVENT));
    expect(result.current.available).toBe(false);
    vi.stubEnv('VITE_SUMUP_AFFILIATE_KEY', '');
    const { result: noKey } = renderHook(() => useSumUp(true, EVENT));
    expect(noKey.current.available).toBe(false);
    expect(native.plugin.setup).not.toHaveBeenCalled();
  });

  it('sets the SDK up once and charges the total with two decimals', async () => {
    const { useSumUp } = await load();
    const { result } = renderHook(() => useSumUp(true, EVENT));
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
    const { result } = renderHook(() => useSumUp(true, EVENT));
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
    const { result } = renderHook(() => useSumUp(true, EVENT));
    await waitFor(() => expect(result.current.tapToPay.selected).toBe(true));
    let outcome;
    await act(async () => {
      outcome = await result.current.charge({ total: 5, foreignTransactionId: 'sale-3' });
    });
    expect(outcome).toEqual({ status: 'failed', code: 'tapToPayActivation' });
    expect(native.plugin.checkout).not.toHaveBeenCalled();
  });

  describe('with the organizer’s account connected on the server (OAuth)', () => {
    beforeEach(() => {
      server.connection = { oauth: true, connected: true, merchantCode: 'MH4H92C7', mine: false };
      native.plugin.status.mockResolvedValue({ loggedIn: false } as never);
      native.plugin.loginWithToken.mockImplementation(async () => {
        native.plugin.status.mockResolvedValue({ loggedIn: true, merchantCode: 'MH4H92C7' });
        return { loggedIn: true };
      });
    });

    it('logs the SDK in with a token from the server, without a login screen', async () => {
      const { useSumUp } = await load();
      const { result } = renderHook(() => useSumUp(true, EVENT));
      await waitFor(() => expect(result.current.loggedIn).toBe(true));
      expect(result.current.mode).toBe('oauth');
      expect(server.sumUpToken).toHaveBeenCalledWith(EVENT);
      expect(native.plugin.loginWithToken).toHaveBeenCalledWith({ accessToken: 'at_1' });
      expect(native.plugin.login).not.toHaveBeenCalled();

      // The token lasts: the payment goes ahead without asking the server again
      await act(async () => {
        await result.current.charge({ total: 5, foreignTransactionId: 'sale-1' });
      });
      expect(server.sumUpToken).toHaveBeenCalledTimes(1);
      expect(native.plugin.checkout).toHaveBeenCalledTimes(1);
    });

    it('replaces a token about to run out before the payment', async () => {
      server.sumUpToken.mockResolvedValueOnce({
        accessToken: 'at_old',
        expiresAt: Date.now() + 60_000,
        merchantCode: 'MH4H92C7',
      });
      const { useSumUp } = await load();
      const { result } = renderHook(() => useSumUp(true, EVENT));
      await waitFor(() => expect(result.current.loggedIn).toBe(true));
      await act(async () => {
        await result.current.charge({ total: 5, foreignTransactionId: 'sale-1' });
      });
      expect(native.plugin.logout).toHaveBeenCalled();
      expect(native.plugin.loginWithToken).toHaveBeenLastCalledWith({ accessToken: 'at_1' });
      expect(native.plugin.checkout).toHaveBeenCalledTimes(1);
    });

    it('charges once more with a new token when SumUp did not take the old one', async () => {
      const { useSumUp } = await load();
      const { result } = renderHook(() => useSumUp(true, EVENT));
      await waitFor(() => expect(result.current.loggedIn).toBe(true));
      native.plugin.checkout.mockResolvedValueOnce({ status: 'failed', code: 'notLoggedIn' });
      let outcome;
      await act(async () => {
        outcome = await result.current.charge({ total: 5, foreignTransactionId: 'sale-1' });
      });
      expect(server.sumUpToken).toHaveBeenCalledTimes(2);
      expect(native.plugin.checkout).toHaveBeenCalledTimes(2);
      expect(outcome).toEqual({ status: 'successful', transactionCode: 'TEENSK4W2K' });
    });

    it('without a connection logs out an account from before, so it takes no money', async () => {
      server.connection = { oauth: true, connected: false, mine: true };
      native.plugin.status.mockResolvedValue({ loggedIn: true, merchantCode: 'OTHER' } as never);
      native.plugin.logout.mockImplementation(async () => {
        native.plugin.status.mockResolvedValue({ loggedIn: false } as never);
      });
      const { useSumUp } = await load();
      const { result } = renderHook(() => useSumUp(true, EVENT));
      await waitFor(() => expect(result.current.loggedIn).toBe(false));
      expect(native.plugin.logout).toHaveBeenCalled();
      expect(result.current.connected).toBe(false);
      expect(result.current.mayConnect).toBe(true);
      expect(server.sumUpToken).not.toHaveBeenCalled();

      // The organizer connects in the system browser, which comes back by deep link
      await act(async () => {
        await result.current.connect();
      });
      expect(server.startConnect).toHaveBeenCalledWith({ app: true });
      expect(browser.open).toHaveBeenCalledWith({
        url: 'https://bazarpro.de/api/sumup/start?state=s',
      });
    });
  });
});
