package __PACKAGE__

import android.content.Intent
import android.os.Build
import android.util.Log
import com.capacitorjs.plugins.pushnotifications.MessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Custom FirebaseMessagingService.
 *
 * Extends Capacitor's MessagingService:
 *  - location_refresh data-only push -> стартира LocationRefreshForegroundService
 *    (работи дори когато JS runtime-ът не е жив: locked screen / killed app).
 *  - всички останали съобщения -> super.onMessageReceived(message), което
 *    запазва текущата JS push доставка през @capacitor/push-notifications.
 *
 * onNewToken също се пропуска до super, така че FCM token registration
 * остава непокътнат.
 *
 * Tag: FamLocNative
 */
class FamilyLocationMessagingService : MessagingService() {

    companion object {
        private const val TAG = "FamLocNative"
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val type = data["type"]
        Log.i(TAG, "onMessageReceived type=$type keys=${data.keys}")

        if (type == "location_refresh") {
            Log.i(TAG, "NATIVE location_refresh push received")
            try {
                val intent = Intent(applicationContext, LocationRefreshForegroundService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    applicationContext.startForegroundService(intent)
                } else {
                    applicationContext.startService(intent)
                }
                Log.i(TAG, "NATIVE foreground service started")
            } catch (t: Throwable) {
                Log.e(TAG, "NATIVE foreground service start FAILED", t)
            }
            return
        }

        // Не е location_refresh -> делегирай към Capacitor (JS path).
        try {
            super.onMessageReceived(message)
        } catch (t: Throwable) {
            Log.e(TAG, "super.onMessageReceived failed", t)
        }
    }

    override fun onNewToken(token: String) {
        Log.i(TAG, "onNewToken len=${token.length}")
        try {
            super.onNewToken(token)
        } catch (t: Throwable) {
            Log.e(TAG, "super.onNewToken failed", t)
        }
    }
}
