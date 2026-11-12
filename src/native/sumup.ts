import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api/functions';
import { useApiClient, useMutation, useOptionalQuery } from '../lib/api/react';
import { apiErrorCode } from '../lib/errors';
import type { Id } from '../lib/api/types';
import { SUMUP_RETURN_EVENT, type SumUpReturn } from './sumupReturn';

/**
 * Card payments with SumUp at the cash desk, in the app only (plugins/sumup). The SDK
 * shows its own screens for pairing the reader and the payment; the desk passes the
 * cart's total and books the sale once the card is charged. The merchant account is the
 * organizer's own, so the money and SumUp's fees are theirs.
 *
 * Login: on a server with SumUp's OAuth (backend/src/modules/sumup.rs) the organizer
 * connects their account once, and every desk of the team logs the SDK in with an access
 * token from the backend. Without it each device logs in with the SDK's login screen.
 */

/** What became of a payment. `unknown`: the reply got lost, it may have gone through. */
export type SumUpOutcome = {
  status: 'successful' | 'failed' | 'unknown';
  /** Why it failed: cancelled, notLoggedIn, permission, noConnectivity, tapToPayActivation, … */
  code?: string;
  /** SumUp's text, in the language of the device */
  message?: string;
  /** SumUp's transaction code, to find the payment in SumUp */
  transactionCode?: string;
  cardType?: string;
  lastFour?: string;
};

type SumUpStatus = {
  loggedIn: boolean;
  merchantCode?: string;
  currency?: string;
  /** iOS: Apple's product name, which must not be written differently */
  tapToPayName?: string;
};

interface SumUpPlugin {
  setup(options: { affiliateKey: string }): Promise<void>;
  status(): Promise<SumUpStatus>;
  login(): Promise<{ loggedIn: boolean }>;
  /** `code`: why it failed, e.g. invalidToken */
  loginWithToken(options: { accessToken: string }): Promise<{ loggedIn: boolean; code?: string }>;
  logout(): Promise<void>;
  openReaderSettings(): Promise<void>;
  prepareForCheckout(): Promise<void>;
  tapToPayStatus(): Promise<{ available: boolean; activated: boolean }>;
  activateTapToPay(): Promise<{ activated: boolean }>;
  checkout(options: {
    /** Decimal string with a dot, e.g. "12.50" */
    amount: string;
    foreignTransactionId: string;
    title?: string;
    tapToPay?: boolean;
  }): Promise<SumUpOutcome>;
}

const SumUp = registerPlugin<SumUpPlugin>('SumUp');

/** SumUp takes no card payment below 1 € */
export const SUMUP_MIN_AMOUNT = 1;

const TAP_TO_PAY_KEY = 'bazarpro.sumup.tapToPay';
/** Expiry and account of the token the SDK was last logged in with (OAuth) */
const TOKEN_KEY = 'bazarpro.sumup.token';
/** A token with less left is replaced before a payment, so it cannot run out in the middle */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
/** Without an answer about the connection the desk goes on with the device's own login */
const CONNECTION_WAIT_MS = 8000;

type HeldToken = { expiresAt: number; merchantCode?: string };

function heldToken(): HeldToken | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as HeldToken | null;
  } catch {
    return null;
  }
}

function holdToken(token: HeldToken | null) {
  if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  else localStorage.removeItem(TOKEN_KEY);
}

function affiliateKey(): string | undefined {
  return (import.meta.env.VITE_SUMUP_AFFILIATE_KEY as string | undefined) || undefined;
}

/** In an app built with BazarPro's affiliate key; elsewhere the desk records card payments by hand. */
export function isSumUpAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SumUp') && !!affiliateKey();
}

/** Only an app with Apple's entitlement may offer it, and only on an iPhone. */
function tapToPayBuild(): boolean {
  return import.meta.env.VITE_SUMUP_TAP_TO_PAY === 'true' && Capacitor.getPlatform() === 'ios';
}

/** The amount for the SDK: two decimals with a dot, as SumUp rejects more. */
export function sumUpAmount(total: number): string {
  return (Math.round(total * 100) / 100).toFixed(2);
}

let setupDone: Promise<void> | null = null;

/** The SDK asks for the location on setup, so it runs when the desk first needs SumUp. */
function setUp(): Promise<void> {
  const key = affiliateKey();
  if (!key) return Promise.reject(new Error('SumUp affiliate key missing'));
  setupDone ??= SumUp.setup({ affiliateKey: key }).catch((error: unknown) => {
    setupDone = null;
    throw error;
  });
  return setupDone;
}

export type SumUpState = ReturnType<typeof useSumUp>;

/**
 * SumUp on this device: whether a merchant is logged in, the reader or Tap to Pay, and
 * the payment. `enabled` is false while the event takes no cards, so the SDK stays off.
 */
export function useSumUp(enabled: boolean, eventId: Id<'events'> | undefined) {
  const available = enabled && isSumUpAvailable() && !!eventId;
  const client = useApiClient();
  const connection = useOptionalQuery(
    api.sumup.getConnection,
    available && eventId ? { eventId } : 'skip'
  );
  const [connectionTimedOut, setConnectionTimedOut] = useState(false);
  useEffect(() => {
    if (!available || connection) return;
    // A server from before OAuth does not answer; offline the last answer is on the device
    const timer = setTimeout(() => setConnectionTimedOut(true), CONNECTION_WAIT_MS);
    return () => clearTimeout(timer);
  }, [available, connection]);
  // Until the server answers it is unknown whether the desk uses OAuth
  const mode = connection
    ? connection.oauth
      ? 'oauth'
      : 'device'
    : connectionTimedOut
      ? 'device'
      : null;
  const connected = connection?.connected === true;
  const connectedMerchant = connection?.merchantCode;
  const [status, setStatus] = useState<SumUpStatus | null>(null);
  const [tapToPay, setTapToPay] = useState({ available: false, activated: false });
  const [preferTapToPay, setPreferTapToPay] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(TAP_TO_PAY_KEY) === 'true'
  );
  const [busy, setBusy] = useState(false);
  /** The organizer's connection was refused (gone, or revoked in SumUp) */
  const [tokenRefused, setTokenRefused] = useState(false);
  const connect = useSumUpConnect();

  /**
   * OAuth: logs the SDK in with the organizer's account. Another account on the device
   * is logged out first; a token that may run out soon is replaced.
   */
  const tokenLogin = useCallback(
    async (force: boolean) => {
      if (!eventId) return;
      const current = await SumUp.status();
      const held = heldToken();
      const fresh =
        current.loggedIn &&
        !!held &&
        held.expiresAt - Date.now() > TOKEN_MARGIN_MS &&
        (!held.merchantCode || held.merchantCode === current.merchantCode);
      if (fresh && !force) return;
      let token;
      try {
        token = await client.sumUpToken(eventId);
      } catch (error) {
        if (apiErrorCode(error) === 'sumup.notConnected') {
          setTokenRefused(true);
          holdToken(null);
          if (current.loggedIn) await SumUp.logout();
          return;
        }
        throw error;
      }
      setTokenRefused(false);
      if (current.loggedIn) await SumUp.logout();
      const result = await SumUp.loginWithToken({ accessToken: token.accessToken });
      holdToken(
        result.loggedIn ? { expiresAt: token.expiresAt, merchantCode: token.merchantCode } : null
      );
    },
    [client, eventId]
  );

  const refresh = useCallback(async () => {
    await setUp();
    if (mode === 'oauth') {
      const current = await SumUp.status();
      if (!connected) {
        // Only the organizer's account takes the money here, not one logged in before
        if (current.loggedIn) await SumUp.logout();
        holdToken(null);
      } else if (
        !current.loggedIn ||
        (connectedMerchant && current.merchantCode !== connectedMerchant)
      ) {
        await tokenLogin(true);
      }
    }
    const next = await SumUp.status();
    setStatus(next);
    // Checked against Apple each time; the requirements and the activation can change
    if (next.loggedIn && tapToPayBuild()) {
      setTapToPay(
        await SumUp.tapToPayStatus().catch(() => ({ available: false, activated: false }))
      );
    } else {
      setTapToPay({ available: false, activated: false });
    }
  }, [mode, connected, connectedMerchant, tokenLogin]);

  useEffect(() => {
    if (!available || !mode) return;
    refresh().catch(() => setStatus({ loggedIn: false }));
  }, [available, mode, refresh]);

  /** Runs one of the SDK's screens and reads the state afterwards. */
  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await setUp();
        await action();
      } finally {
        await refresh().catch(() => undefined);
        setBusy(false);
      }
    },
    [refresh]
  );

  const useTapToPay = tapToPay.available && preferTapToPay;
  const oauth = mode === 'oauth';

  return {
    /** The app can take card payments with SumUp here */
    available,
    /**
     * `oauth`: the organizer's account connected on the server, used by every desk of the
     * team; `device`: each device logs in itself. null while the server is asked.
     */
    mode,
    /** OAuth: the organizer has connected an account that still works */
    connected: oauth ? connected && !tokenRefused : undefined,
    /** OAuth: the signed-in user is the organizer, who connects the account */
    mayConnect: oauth && connection?.mine === true,
    /** null while it is being asked */
    loggedIn: !mode || !status ? null : oauth && !connected ? false : status.loggedIn,
    merchantCode: status?.merchantCode ?? connectedMerchant,
    busy,
    tapToPay: {
      ...tapToPay,
      name: status?.tapToPayName ?? 'Tap to Pay on iPhone',
      /** The desk takes the card on the phone instead of the reader */
      selected: useTapToPay,
    },
    /** Device: the SDK's login screen. OAuth: logs in again with a new token. */
    login: () => run(() => (oauth ? tokenLogin(true) : SumUp.login())),
    /** OAuth, organizer only: opens SumUp to connect the account */
    connect,
    logout: () => run(() => SumUp.logout()),
    openReaderSettings: () => run(() => SumUp.openReaderSettings()),
    selectTapToPay: (on: boolean) => {
      localStorage.setItem(TAP_TO_PAY_KEY, String(on));
      setPreferTapToPay(on);
    },
    /** Wakes the reader while the cart fills; harmless when there is none */
    prepare: () => {
      if (status?.loggedIn && !useTapToPay) void SumUp.prepareForCheckout().catch(() => undefined);
    },
    /**
     * Charges the total. The foreign ID is the desk sale's, so the payment can be found
     * by the sale. Tap to Pay is activated first if this iPhone has not been yet.
     */
    charge: async (options: {
      total: number;
      foreignTransactionId: string;
      title?: string;
    }): Promise<SumUpOutcome> => {
      await setUp();
      if (oauth) await tokenLogin(false);
      if (useTapToPay && !tapToPay.activated) {
        const { activated } = await SumUp.activateTapToPay();
        setTapToPay((current) => ({ ...current, activated }));
        if (!activated) return { status: 'failed', code: 'tapToPayActivation' };
      }
      const request = {
        amount: sumUpAmount(options.total),
        foreignTransactionId: options.foreignTransactionId,
        title: options.title,
        tapToPay: useTapToPay,
      };
      let outcome = await SumUp.checkout(request);
      // The token ran out before the payment started, so no card was charged: once more
      // with a new one
      if (oauth && outcome.code === 'notLoggedIn') {
        await tokenLogin(true);
        outcome = await SumUp.checkout(request);
      }
      if (outcome.code === 'notLoggedIn') await refresh().catch(() => undefined);
      return outcome;
    },
  };
}

/**
 * Connects the signed-in user's SumUp account (OAuth): in the app in the system browser,
 * which returns by deep link; on the web on this page, which gets `?sumup=…` back.
 */
export function useSumUpConnect() {
  const start = useMutation(api.sumup.startConnect);
  return useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const { url } = await start({ app: true });
      await Browser.open({ url });
      return;
    }
    const { url } = await start({
      redirectTo: `${window.location.pathname}${window.location.search}`,
    });
    window.location.assign(url);
  }, [start]);
}

/**
 * Tells when connecting SumUp came back: the app's deep link, or `?sumup=` on the web,
 * which is taken off the address so a reload does not tell again.
 */
export function useSumUpReturn(onReturn: (result: SumUpReturn) => void) {
  const callback = useRef(onReturn);
  callback.current = onReturn;
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('sumup');
    if (result) {
      url.searchParams.delete('sumup');
      window.history.replaceState(window.history.state, '', url.toString());
      callback.current(result === 'connected' ? {} : { error: result });
    }
    const listener = (event: Event) => callback.current((event as CustomEvent<SumUpReturn>).detail);
    window.addEventListener(SUMUP_RETURN_EVENT, listener);
    return () => window.removeEventListener(SUMUP_RETURN_EVENT, listener);
  }, []);
}
