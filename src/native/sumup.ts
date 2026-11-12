import { Capacitor, registerPlugin } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';

/**
 * Card payments with SumUp at the cash desk, in the app only (plugins/sumup). The SDK
 * shows its own screens for login, pairing the reader and the payment; the desk passes
 * the cart's total and books the sale once the card is charged. The merchant account is
 * the organizer's own, logged in on the device, so the money and SumUp's fees are theirs.
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
export function useSumUp(enabled: boolean) {
  const available = enabled && isSumUpAvailable();
  const [status, setStatus] = useState<SumUpStatus | null>(null);
  const [tapToPay, setTapToPay] = useState({ available: false, activated: false });
  const [preferTapToPay, setPreferTapToPay] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(TAP_TO_PAY_KEY) === 'true'
  );
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    await setUp();
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
  }, []);

  useEffect(() => {
    if (!available) return;
    refresh().catch(() => setStatus({ loggedIn: false }));
  }, [available, refresh]);

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

  return {
    /** The app can take card payments with SumUp here */
    available,
    /** null while it is being asked */
    loggedIn: status ? status.loggedIn : null,
    merchantCode: status?.merchantCode,
    busy,
    tapToPay: {
      ...tapToPay,
      name: status?.tapToPayName ?? 'Tap to Pay on iPhone',
      /** The desk takes the card on the phone instead of the reader */
      selected: useTapToPay,
    },
    login: () => run(() => SumUp.login()),
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
      if (useTapToPay && !tapToPay.activated) {
        const { activated } = await SumUp.activateTapToPay();
        setTapToPay((current) => ({ ...current, activated }));
        if (!activated) return { status: 'failed', code: 'tapToPayActivation' };
      }
      const outcome = await SumUp.checkout({
        amount: sumUpAmount(options.total),
        foreignTransactionId: options.foreignTransactionId,
        title: options.title,
        tapToPay: useTapToPay,
      });
      if (outcome.code === 'notLoggedIn') await refresh().catch(() => undefined);
      return outcome;
    },
  };
}
