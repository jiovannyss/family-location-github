package __PACKAGE__

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Native foreground service: при location_refresh push взема свежа GPS
 * локация и я качва към location-refresh-upload edge function.
 *
 * Изисква:
 *  - <service ... foregroundServiceType="location"> в AndroidManifest
 *  - ACCESS_FINE_LOCATION runtime permission (проверява се; ако липсва -> abort)
 *  - SUPABASE_URL и SUPABASE_ANON_KEY като <meta-data> в manifest
 *  - fam_user_id и fam_device_id записани в SharedPreferences "CapacitorStorage"
 *    (пише се от JS в src/services/push.ts при registration)
 */
class LocationRefreshForegroundService : Service() {

    companion object {
        private const val TAG = "FamLocNative"
        private const val CHANNEL_ID = "loc_refresh_channel"
        private const val NOTIF_ID = 4711
        private const val GPS_TIMEOUT_MS = 30_000L
        private const val UPLOAD_TIMEOUT_S = 15L
        private const val PREFS_NAME = "CapacitorStorage"
        private const val PREFS_USER = "fam_user_id"
        private const val PREFS_DEVICE = "fam_device_id"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var stopped = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "NATIVE service onCreate")
        ensureChannel()
        val notif = buildNotification()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIF_ID, notif,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                )
            } else {
                startForeground(NOTIF_ID, notif)
            }
            Log.i(TAG, "NATIVE startForeground OK")
        } catch (t: Throwable) {
            Log.e(TAG, "NATIVE startForeground FAILED", t)
            stopSelfSafe()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "NATIVE onStartCommand")

        // Permission guard
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            Log.w(TAG, "NATIVE ABORT missing permission ACCESS_FINE_LOCATION")
            stopSelfSafe()
            return START_NOT_STICKY
        }

        // Read cached identity
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val userId = prefs.getString(PREFS_USER, null)
        val deviceId = prefs.getString(PREFS_DEVICE, null)
        if (userId.isNullOrBlank() || deviceId.isNullOrBlank()) {
            Log.w(TAG, "NATIVE ABORT missing user/device in CapacitorStorage")
            stopSelfSafe()
            return START_NOT_STICKY
        }

        requestLocationAndUpload(userId, deviceId)
        return START_NOT_STICKY
    }

    private fun requestLocationAndUpload(userId: String, deviceId: String) {
        Log.i(TAG, "NATIVE GPS request started")
        val client = LocationServices.getFusedLocationProviderClient(this)
        val cts = CancellationTokenSource()

        val watchdog = Runnable {
            Log.w(TAG, "NATIVE GPS watchdog timeout after ${GPS_TIMEOUT_MS}ms")
            try { cts.cancel() } catch (_: Throwable) {}
            stopSelfSafe()
        }
        mainHandler.postDelayed(watchdog, GPS_TIMEOUT_MS)

        try {
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { loc ->
                    mainHandler.removeCallbacks(watchdog)
                    if (loc == null) {
                        Log.w(TAG, "NATIVE GPS success but null location")
                        stopSelfSafe()
                        return@addOnSuccessListener
                    }
                    Log.i(TAG, "NATIVE GPS success lat=${loc.latitude} lng=${loc.longitude} acc=${loc.accuracy}")
                    Thread {
                        uploadPoint(userId, deviceId, loc.latitude, loc.longitude, loc.accuracy.toDouble())
                        stopSelfSafe()
                    }.start()
                }
                .addOnFailureListener { e ->
                    mainHandler.removeCallbacks(watchdog)
                    Log.e(TAG, "NATIVE GPS failure", e)
                    stopSelfSafe()
                }
        } catch (t: Throwable) {
            mainHandler.removeCallbacks(watchdog)
            Log.e(TAG, "NATIVE GPS request exception", t)
            stopSelfSafe()
        }
    }

    private fun uploadPoint(userId: String, deviceId: String, lat: Double, lng: Double, accuracy: Double) {
        Log.i(TAG, "NATIVE upload started")
        try {
            val supabaseUrl = readMetaString("SUPABASE_URL")
            val anonKey = readMetaString("SUPABASE_ANON_KEY")
            if (supabaseUrl.isNullOrBlank() || anonKey.isNullOrBlank()) {
                Log.e(TAG, "NATIVE upload ABORT missing SUPABASE_URL/ANON_KEY meta-data")
                return
            }

            val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date())

            val body = JSONObject().apply {
                put("userId", userId)
                put("deviceId", deviceId)
                put("latitude", lat)
                put("longitude", lng)
                put("accuracy", accuracy)
                put("timestamp", iso)
                put("source", "native_push_location_refresh")
                put("devicePlatform", "android")
            }.toString()

            val client = OkHttpClient.Builder()
                .connectTimeout(UPLOAD_TIMEOUT_S, TimeUnit.SECONDS)
                .readTimeout(UPLOAD_TIMEOUT_S, TimeUnit.SECONDS)
                .writeTimeout(UPLOAD_TIMEOUT_S, TimeUnit.SECONDS)
                .build()

            val req = Request.Builder()
                .url("$supabaseUrl/functions/v1/location-refresh-upload")
                .header("Content-Type", "application/json")
                .header("apikey", anonKey)
                .header("Authorization", "Bearer $anonKey")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(req).execute().use { resp ->
                val code = resp.code
                val respBody = resp.body?.string()?.take(300) ?: ""
                if (resp.isSuccessful) {
                    Log.i(TAG, "NATIVE upload success status=$code body=$respBody")
                } else {
                    Log.e(TAG, "NATIVE upload failure status=$code body=$respBody")
                }
            }
        } catch (t: Throwable) {
            Log.e(TAG, "NATIVE upload exception", t)
        }
    }

    private fun readMetaString(key: String): String? {
        return try {
            val ai = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
            ai.metaData?.getString(key)
        } catch (t: Throwable) {
            Log.e(TAG, "readMeta $key failed", t)
            null
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val ch = NotificationChannel(
            CHANNEL_ID,
            "Обновяване на локацията",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Кратка фонова услуга за обновяване на локацията"
            setShowBadge(false)
        }
        mgr.createNotificationChannel(ch)
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Семейна локация")
            .setContentText("Обновяване на локацията...")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun stopSelfSafe() {
        if (stopped) return
        stopped = true
        Log.i(TAG, "NATIVE service stopped")
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (_: Throwable) {}
        stopSelf()
    }

    override fun onDestroy() {
        Log.i(TAG, "NATIVE onDestroy")
        super.onDestroy()
    }
}
