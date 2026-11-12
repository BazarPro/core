package de.bazarpro.sumup;

import android.content.Intent;
import androidx.activity.result.ActivityResult;
import androidx.core.content.IntentCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.sumup.checkout.core.models.TransactionInfo;
import com.sumup.merchant.reader.api.SumUpAPI;
import com.sumup.merchant.reader.api.SumUpCardReaderPageContract;
import com.sumup.merchant.reader.api.SumUpCheckoutContract;
import com.sumup.merchant.reader.api.SumUpLogin;
import com.sumup.merchant.reader.api.SumUpLoginContract;
import com.sumup.merchant.reader.api.SumUpPayment;
import com.sumup.merchant.reader.models.Merchant;
import java.math.BigDecimal;

/**
 * The cash desk's card payments with a SumUp reader (Air, Solo over Bluetooth). The SDK
 * brings its own screens for login, reader pairing and payment; this plugin starts them
 * and hands their results to the web app (src/native/sumup.ts). Tap to Pay on Android is
 * a separate SDK with closed access and not part of this plugin.
 */
@CapacitorPlugin(name = "SumUp")
public class SumUpPlugin extends Plugin {

    /** BazarPro's affiliate key; SumUp ties it to the app ID de.bazarpro.app */
    private String affiliateKey;

    @PluginMethod
    public void setup(PluginCall call) {
        String key = call.getString("affiliateKey");
        if (key == null || key.isEmpty()) {
            call.reject("affiliateKey missing", "invalidArgument");
            return;
        }
        affiliateKey = key;
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        boolean loggedIn = SumUpAPI.isLoggedIn();
        result.put("loggedIn", loggedIn);
        if (loggedIn) {
            Merchant merchant = SumUpAPI.getCurrentMerchant();
            if (merchant != null) {
                result.put("merchantCode", merchant.getMerchantCode());
                if (merchant.getCurrency() != null) {
                    result.put("currency", merchant.getCurrency().name());
                }
            }
        }
        call.resolve(result);
    }

    /** The SDK's own login screen; resolves with whether a merchant is logged in after it. */
    @PluginMethod
    public void login(PluginCall call) {
        if (SumUpAPI.isLoggedIn()) {
            call.resolve(loggedIn());
            return;
        }
        if (affiliateKey == null) {
            call.reject("setup first", "notSetUp");
            return;
        }
        SumUpLogin login = SumUpLogin.builder(affiliateKey).build();
        Intent intent = new SumUpLoginContract().createIntent(getContext(), login);
        startActivityForResult(call, intent, "loginResult");
    }

    @ActivityCallback
    private void loginResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        call.resolve(loggedIn());
    }

    /**
     * Logs in with an OAuth access token of the organizer's account (backend/src/modules/
     * sumup.rs), without a login screen. Another merchant must be logged out first.
     */
    @PluginMethod
    public void loginWithToken(PluginCall call) {
        String token = call.getString("accessToken");
        if (token == null || token.isEmpty()) {
            call.reject("accessToken missing", "invalidArgument");
            return;
        }
        if (affiliateKey == null) {
            call.reject("setup first", "notSetUp");
            return;
        }
        SumUpLogin login = SumUpLogin.builder(affiliateKey).accessToken(token).build();
        Intent intent = new SumUpLoginContract().createIntent(getContext(), login);
        startActivityForResult(call, intent, "tokenLoginResult");
    }

    @ActivityCallback
    private void tokenLoginResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject outcome = loggedIn();
        Intent data = result.getData();
        if (!SumUpAPI.isLoggedIn() && data != null) {
            int code = data.getIntExtra(SumUpAPI.Response.RESULT_CODE, -1);
            outcome.put("code", code == SumUpAPI.Response.ResultCode.ERROR_INVALID_TOKEN ? "invalidToken" : failureCode(code));
        }
        call.resolve(outcome);
    }

    @PluginMethod
    public void logout(PluginCall call) {
        SumUpAPI.logout();
        call.resolve();
    }

    /** Pairing and status of the reader, the SDK's screen. */
    @PluginMethod
    public void openReaderSettings(PluginCall call) {
        if (!SumUpAPI.isLoggedIn()) {
            call.reject("not logged in", "notLoggedIn");
            return;
        }
        Intent intent = new SumUpCardReaderPageContract().createIntent(getContext(), null);
        startActivityForResult(call, intent, "readerSettingsResult");
    }

    @ActivityCallback
    private void readerSettingsResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        call.resolve();
    }

    /** Wakes the paired reader while the cart fills, so the payment starts faster. */
    @PluginMethod
    public void prepareForCheckout(PluginCall call) {
        if (SumUpAPI.isLoggedIn()) {
            SumUpAPI.prepareForCheckout();
        }
        call.resolve();
    }

    /** Only with an iPhone; Android has no Tap to Pay in this plugin. */
    @PluginMethod
    public void tapToPayStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", false);
        result.put("activated", false);
        call.resolve(result);
    }

    @PluginMethod
    public void activateTapToPay(PluginCall call) {
        call.unavailable("Tap to Pay is not available on Android");
    }

    /**
     * Charges the amount (a decimal string like "12.50", so no float rounding) in the
     * merchant's currency. Resolves with the outcome; it rejects only when no payment was
     * started at all.
     */
    @PluginMethod
    public void checkout(PluginCall call) {
        String amount = call.getString("amount");
        String foreignTransactionId = call.getString("foreignTransactionId");
        if (amount == null || foreignTransactionId == null) {
            call.reject("amount and foreignTransactionId are required", "invalidArgument");
            return;
        }
        if (call.getBoolean("tapToPay", false)) {
            call.unavailable("Tap to Pay is not available on Android");
            return;
        }
        if (!SumUpAPI.isLoggedIn()) {
            call.reject("not logged in", "notLoggedIn");
            return;
        }
        Merchant merchant = SumUpAPI.getCurrentMerchant();
        if (merchant == null || merchant.getCurrency() == null) {
            call.reject("no merchant", "notLoggedIn");
            return;
        }
        BigDecimal total;
        try {
            total = new BigDecimal(amount);
        } catch (NumberFormatException e) {
            call.reject("amount is no number", "invalidArgument");
            return;
        }
        SumUpPayment.Builder builder = SumUpPayment.builder()
            .total(total)
            .currency(merchant.getCurrency())
            .foreignTransactionId(foreignTransactionId)
            // When the reply gets lost, the SDK asks SumUp for up to a minute and then
            // reports the status as unknown instead of as failed
            .configureRetryPolicy(2000, 60000, true)
            .successScreenTimeout(3);
        String title = call.getString("title");
        if (title != null && !title.isEmpty()) {
            builder.title(title);
        }
        String receiptEmail = call.getString("receiptEmail");
        if (receiptEmail != null && !receiptEmail.isEmpty()) {
            builder.receiptEmail(receiptEmail);
        }
        Intent intent = new SumUpCheckoutContract().createIntent(getContext(), builder.build());
        startActivityForResult(call, intent, "checkoutResult");
    }

    @ActivityCallback
    private void checkoutResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject outcome = new JSObject();
        Intent data = result.getData();
        if (data == null) {
            // Closed without a result: no payment was taken
            outcome.put("status", "failed");
            outcome.put("code", "cancelled");
            call.resolve(outcome);
            return;
        }
        int code = data.getIntExtra(SumUpAPI.Response.RESULT_CODE, -1);
        if (code == SumUpAPI.Response.ResultCode.SUCCESSFUL) {
            outcome.put("status", "successful");
        } else if (code == SumUpAPI.Response.ResultCode.ERROR_UNKNOWN_TRANSACTION_STATUS) {
            outcome.put("status", "unknown");
        } else {
            outcome.put("status", "failed");
            outcome.put("code", failureCode(code));
        }
        String message = data.getStringExtra(SumUpAPI.Response.MESSAGE);
        if (message != null) outcome.put("message", message);
        String transactionCode = data.getStringExtra(SumUpAPI.Response.TX_CODE);
        TransactionInfo info = IntentCompat.getParcelableExtra(
            data,
            SumUpAPI.Response.TX_INFO,
            TransactionInfo.class
        );
        if (info != null) {
            if (transactionCode == null) transactionCode = info.getTransactionCode();
            if (info.getCard() != null) {
                outcome.put("cardType", info.getCard().getType());
                outcome.put("lastFour", info.getCard().getLast4Digits());
            }
        }
        if (transactionCode != null) outcome.put("transactionCode", transactionCode);
        call.resolve(outcome);
    }

    private static JSObject loggedIn() {
        JSObject result = new JSObject();
        result.put("loggedIn", SumUpAPI.isLoggedIn());
        return result;
    }

    /** The SDK's result codes the web app reacts to; everything else is "failed". */
    private static String failureCode(int code) {
        if (code == SumUpAPI.Response.ResultCode.ERROR_NOT_LOGGED_IN
            || code == SumUpAPI.Response.ResultCode.ERROR_INVALID_TOKEN) {
            return "notLoggedIn";
        }
        if (code == SumUpAPI.Response.ResultCode.ERROR_NO_CONNECTIVITY) return "noConnectivity";
        if (code == SumUpAPI.Response.ResultCode.ERROR_GEOLOCATION_REQUIRED
            || code == SumUpAPI.Response.ResultCode.ERROR_PERMISSION_DENIED) {
            return "permission";
        }
        if (code == SumUpAPI.Response.ResultCode.ERROR_INVALID_AFFILIATE_KEY) return "affiliateKey";
        return "failed";
    }
}
