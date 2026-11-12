import Foundation
import Capacitor
import SumUpSDK

/// The cash desk's card payments with SumUp: a Bluetooth reader (Air, Solo) or Tap to Pay
/// on iPhone. The SDK brings its own screens for login, reader pairing and payment; this
/// plugin starts them and hands their results to the web app (src/native/sumup.ts).
@objc(SumUpPlugin)
public class SumUpPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SumUpPlugin"
    public let jsName = "SumUp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loginWithToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openReaderSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareForCheckout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tapToPayStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "activateTapToPay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkout", returnType: CAPPluginReturnPromise)
    ]

    /// setup may run once per app start; it asks for the location, so not at launch
    private var isSetUp = false

    @objc func setup(_ call: CAPPluginCall) {
        guard let key = call.getString("affiliateKey"), !key.isEmpty else {
            call.reject("affiliateKey missing", "invalidArgument")
            return
        }
        DispatchQueue.main.async {
            if !self.isSetUp {
                SumUpSDK.setup(affiliateKey: key)
                self.isSetUp = true
            }
            call.resolve()
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var result: [String: Any] = ["loggedIn": SumUpSDK.isLoggedIn]
            if let merchant = SumUpSDK.currentMerchant {
                if let code = merchant.merchantCode { result["merchantCode"] = code }
                if let currency = merchant.currencyCode { result["currency"] = currency }
            }
            result["tapToPayName"] = SumUpSDK.tapToPayProductName()
            call.resolve(result)
        }
    }

    @objc func login(_ call: CAPPluginCall) {
        guard isSetUp else {
            call.reject("setup first", "notSetUp")
            return
        }
        DispatchQueue.main.async {
            if SumUpSDK.isLoggedIn {
                call.resolve(["loggedIn": true])
                return
            }
            guard let controller = self.bridge?.viewController else {
                call.reject("no view", "failed")
                return
            }
            SumUpSDK.presentLogin(from: controller, animated: true) { _, _ in
                // Cancelled or failed: the SDK showed why, the desk only needs the state
                call.resolve(["loggedIn": SumUpSDK.isLoggedIn])
            }
        }
    }

    /// Logs in with an OAuth access token of the organizer's account (backend/src/modules/
    /// sumup.rs), without a login screen. Another merchant must be logged out first.
    @objc func loginWithToken(_ call: CAPPluginCall) {
        guard isSetUp else {
            call.reject("setup first", "notSetUp")
            return
        }
        guard let token = call.getString("accessToken"), !token.isEmpty else {
            call.reject("accessToken missing", "invalidArgument")
            return
        }
        DispatchQueue.main.async {
            SumUpSDK.login(withToken: token) { _, error in
                var result: [String: Any] = ["loggedIn": SumUpSDK.isLoggedIn]
                if !SumUpSDK.isLoggedIn {
                    let nsError = error as NSError?
                    result["code"] = nsError?.domain == SumUpSDKErrorDomain
                        && nsError?.code == SumUpSDKError.invalidAccessToken.rawValue
                        ? "invalidToken" : Self.failureCode(error)
                }
                call.resolve(result)
            }
        }
    }

    @objc func logout(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            SumUpSDK.logout { _, _ in call.resolve() }
        }
    }

    @objc func openReaderSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard SumUpSDK.isLoggedIn else {
                call.reject("not logged in", "notLoggedIn")
                return
            }
            guard let controller = self.bridge?.viewController else {
                call.reject("no view", "failed")
                return
            }
            SumUpSDK.presentCardReaderSettings(from: controller, animated: true) { _, error in
                if let error {
                    call.reject(error.localizedDescription, "failed")
                } else {
                    call.resolve()
                }
            }
        }
    }

    /// Wakes the paired reader while the cart fills, so the payment starts faster.
    @objc func prepareForCheckout(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if SumUpSDK.isLoggedIn && !SumUpSDK.checkoutInProgress {
                SumUpSDK.prepareForCheckout()
            }
            call.resolve()
        }
    }

    /// Asked again on every start: Apple's requirements and the activation can change.
    @objc func tapToPayStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard SumUpSDK.isLoggedIn else {
                call.resolve(["available": false, "activated": false])
                return
            }
            SumUpSDK.checkTapToPayAvailability { available, activated, _ in
                call.resolve(["available": available, "activated": activated])
            }
        }
    }

    /// Links the Apple ID with the SumUp account and prepares the iPhone, once per device.
    @objc func activateTapToPay(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else {
                call.reject("no view", "failed")
                return
            }
            SumUpSDK.presentTapToPayActivation(from: controller, animated: true) { success, _ in
                call.resolve(["activated": success])
            }
        }
    }

    /// Charges the amount (a decimal string like "12.50", so no float rounding) in the
    /// merchant's currency. Resolves with the outcome; it rejects only when no payment
    /// was started at all.
    @objc func checkout(_ call: CAPPluginCall) {
        guard let amount = call.getString("amount"),
              let foreignTransactionId = call.getString("foreignTransactionId") else {
            call.reject("amount and foreignTransactionId are required", "invalidArgument")
            return
        }
        let total = NSDecimalNumber(string: amount, locale: Locale(identifier: "en_US_POSIX"))
        if total == NSDecimalNumber.notANumber {
            call.reject("amount is no number", "invalidArgument")
            return
        }
        let tapToPay = call.getBool("tapToPay") ?? false
        let title = call.getString("title")
        DispatchQueue.main.async {
            guard SumUpSDK.isLoggedIn, let currency = SumUpSDK.currentMerchant?.currencyCode,
                  !currency.isEmpty else {
                call.reject("not logged in", "notLoggedIn")
                return
            }
            guard let controller = self.bridge?.viewController else {
                call.reject("no view", "failed")
                return
            }
            let request = CheckoutRequest(
                total: total,
                title: title,
                currencyCode: currency,
                paymentMethod: tapToPay ? .tapToPay : .cardReader
            )
            request.foreignTransactionID = foreignTransactionId
            request.successScreenTimeout = 3
            SumUpSDK.checkout(with: request, from: controller) { result, error in
                var outcome: [String: Any] = [:]
                if let result, result.success {
                    outcome["status"] = "successful"
                } else if let error = error as NSError?, error.domain == NSURLErrorDomain {
                    // The payment may have gone through; the desk asks the cashier to look
                    outcome["status"] = "unknown"
                    outcome["message"] = error.localizedDescription
                } else {
                    outcome["status"] = "failed"
                    outcome["code"] = Self.failureCode(error)
                    if let error { outcome["message"] = error.localizedDescription }
                }
                if let code = result?.transactionCode { outcome["transactionCode"] = code }
                if let card = result?.additionalInfo?["card"] as? [String: Any] {
                    if let type = card["type"] as? String { outcome["cardType"] = type }
                    if let lastFour = card["last_4_digits"] as? String { outcome["lastFour"] = lastFour }
                }
                call.resolve(outcome)
            }
        }
    }

    /// The SDK's error codes the web app reacts to; everything else is "failed".
    private static func failureCode(_ error: Error?) -> String {
        guard let error = error as NSError? else { return "cancelled" }
        guard error.domain == SumUpSDKErrorDomain else { return "failed" }
        switch error.code {
        case SumUpSDKError.accountNotLoggedIn.rawValue, SumUpSDKError.invalidAccessToken.rawValue:
            return "notLoggedIn"
        case SumUpSDKError.tapToPayActivationNeeded.rawValue:
            return "tapToPayActivation"
        case SumUpSDKError.checkoutInProgress.rawValue:
            return "inProgress"
        default:
            return "failed"
        }
    }
}
