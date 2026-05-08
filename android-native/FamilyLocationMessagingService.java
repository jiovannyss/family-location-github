package __PACKAGE__;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Custom FirebaseMessagingService.
 *
 * Extends Capacitor's MessagingService:
 *  - location_refresh data-only push -> стартира LocationRefreshForegroundService
 *    (работи дори когато JS runtime-ът не е жив: locked screen / killed app).
 *  - всички останали съобщения -> super.onMessageReceived(message), което
 *    запазва текущата JS push доставка през @capacitor/push-notifications.
 *
 * Tag: FamLocNative
 *
 * Написано на Java (не Kotlin), защото Capacitor app/build.gradle по
 * default няма kotlin-android plugin и .kt файлове не биха се компилирали.
 */
public class FamilyLocationMessagingService extends MessagingService {

    private static final String TAG = "FamLocNative";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        try {
            String type = null;
            try { type = message.getData().get("type"); } catch (Throwable ignored) {}
            Log.i(TAG, "onMessageReceived type=" + type);

            if ("location_refresh".equals(type)) {
                Log.i(TAG, "NATIVE location_refresh push received");

                // Permission guard ПРЕДИ startForegroundService — иначе системата
                // ще ни убие с ForegroundServiceDidNotStartInTimeException.
                boolean granted = ContextCompat.checkSelfPermission(
                        getApplicationContext(),
                        Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED;
                if (!granted) {
                    Log.w(TAG, "NATIVE ABORT: ACCESS_FINE_LOCATION not granted");
                    return;
                }

                try {
                    Intent intent = new Intent(getApplicationContext(), LocationRefreshForegroundService.class);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        getApplicationContext().startForegroundService(intent);
                    } else {
                        getApplicationContext().startService(intent);
                    }
                    Log.i(TAG, "NATIVE foreground service start requested");
                } catch (Throwable t) {
                    Log.e(TAG, "NATIVE startForegroundService FAILED", t);
                }
                return;
            }

            // Не е location_refresh -> делегирай към Capacitor (JS path).
            try {
                super.onMessageReceived(message);
            } catch (Throwable t) {
                Log.e(TAG, "super.onMessageReceived failed", t);
            }
        } catch (Throwable outer) {
            // НИКОГА не оставяй неочаквана грешка да убие процеса.
            Log.e(TAG, "onMessageReceived OUTER catch", outer);
        }
    }

    @Override
    public void onNewToken(String token) {
        try {
            Log.i(TAG, "onNewToken len=" + (token == null ? 0 : token.length()));
            super.onNewToken(token);
        } catch (Throwable t) {
            Log.e(TAG, "onNewToken failed", t);
        }
    }
}
