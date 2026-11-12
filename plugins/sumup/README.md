# SumUp at the cash desk (Capacitor plugin)

Native bridge to the SumUp reader SDK (Android `com.sumup:merchant-sdk`, iOS
`sumup-ios-sdk`) for card payments at the cash desk (#155). The JS side and the flow are
in `src/native/sumup.ts` and `CheckoutPage.tsx`: the desk charges the cart's total and
books the sale afterwards, with SumUp's transaction code. A charged sale the backend
refuses goes to the offline queue, so its other items are booked and the rest becomes a
conflict in the cash summary, to be refunded in SumUp.

The organizer logs in on the device with their own SumUp account (the SDK's login
screen). Payments and SumUp's fees are theirs; buyers pay the price on the label
(a surcharge on consumer cards is void under § 270a BGB).

## Setup

1. In the SumUp dashboard (Settings → Developer → Affiliate keys) create an affiliate
   key and add the application ID `de.bazarpro.app` (Android and iOS).
2. Build the app with it: `VITE_SUMUP_AFFILIATE_KEY=… npm run build:app`. CI reads the
   repository variable `SUMUP_AFFILIATE_KEY`. Without the key the app has no SumUp and the
   desk records card payments by hand, as in the browser.
3. Test with a SumUp sandbox merchant (developer.sumup.com → quickstart) so no real money
   moves.

Supported: Bluetooth readers (Air, Solo, Solo Lite, 3G, PIN+) on Android 8+ and iOS 16+.
Tap to Pay on iPhone works with the same SDK, but only with Apple's entitlement
`com.apple.developer.proximity-reader.payment.acceptance`; once the app holds it, add it
to the app's entitlements and build with `VITE_SUMUP_TAP_TO_PAY=true`. Tap to Pay on
Android is a separate SDK with closed access and not part of this plugin.
