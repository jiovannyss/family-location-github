package __PACKAGE__;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Native foreground service: при location_refresh push взема свежа GPS
 * локация и я качва към location-refresh-upload edge function.
 *
 * Java (не Kotlin) за да работи без kotlin-android plugin в app gradle.
 * Ползва HttpURLConnection (не OkHttp) за да няма external dependency.
 */
public class LocationRefreshForegroundService extends Service {

    private static final String TAG = "FamLocNative";
    private static final String CHANNEL_ID = "loc_refresh_channel";
    private static final int NOTIF_ID = 4711;
    private static final long GPS_TIMEOUT_MS = 30_000L;
    private static final int UPLOAD_TIMEOUT_MS = 15_000;
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String PREFS_USER = "fam_user_id";
    private static final String PREFS_DEVICE = "fam_device_id";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean stopped = false;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            Log.i(TAG, "NATIVE service onCreate");
            ensureChannel();
            // ВАЖНО: startForeground ТРЯБВА да е извикан в рамките на 5 сек
            // от startForegroundService, иначе системата убива процеса.
            // Стартираме без type първо — гарантирано работи без permission.
            // Type=LOCATION се прилага само ако имаме permission и API >= Q.
            Notification notif = buildNotification();
            boolean hasFineLoc = ContextCompat.checkSelfPermission(
                    this, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;
            try {
                if (hasFineLoc && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                } else {
                    startForeground(NOTIF_ID, notif);
                }
                Log.i(TAG, "NATIVE startForeground OK (typeLocation=" + hasFineLoc + ")");
            } catch (Throwable t) {
                // Fallback: пробвай без type
                Log.e(TAG, "NATIVE startForeground with type FAILED, retry without type", t);
                try {
                    startForeground(NOTIF_ID, notif);
                } catch (Throwable t2) {
                    Log.e(TAG, "NATIVE startForeground retry FAILED", t2);
                }
            }
        } catch (Throwable outer) {
            Log.e(TAG, "NATIVE onCreate OUTER", outer);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            Log.i(TAG, "NATIVE onStartCommand");

            boolean granted = ContextCompat.checkSelfPermission(
                    this, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;
            if (!granted) {
                Log.w(TAG, "NATIVE ABORT missing permission ACCESS_FINE_LOCATION");
                stopSelfSafe();
                return START_NOT_STICKY;
            }

            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String userId = prefs.getString(PREFS_USER, null);
            String deviceId = prefs.getString(PREFS_DEVICE, null);
            if (userId == null || userId.isEmpty() || deviceId == null || deviceId.isEmpty()) {
                Log.w(TAG, "NATIVE ABORT missing user/device in CapacitorStorage");
                stopSelfSafe();
                return START_NOT_STICKY;
            }

            requestLocationAndUpload(userId, deviceId);
        } catch (Throwable t) {
            Log.e(TAG, "NATIVE onStartCommand OUTER", t);
            stopSelfSafe();
        }
        return START_NOT_STICKY;
    }

    private void requestLocationAndUpload(final String userId, final String deviceId) {
        Log.i(TAG, "NATIVE GPS request started");
        try {
            final CancellationTokenSource cts = new CancellationTokenSource();
            final Runnable[] watchdogRef = new Runnable[1];
            watchdogRef[0] = new Runnable() {
                @Override public void run() {
                    Log.w(TAG, "NATIVE GPS watchdog timeout");
                    try { cts.cancel(); } catch (Throwable ignored) {}
                    stopSelfSafe();
                }
            };
            mainHandler.postDelayed(watchdogRef[0], GPS_TIMEOUT_MS);

            LocationServices.getFusedLocationProviderClient(this)
                .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken())
                .addOnSuccessListener(new com.google.android.gms.tasks.OnSuccessListener<Location>() {
                    @Override public void onSuccess(Location loc) {
                        mainHandler.removeCallbacks(watchdogRef[0]);
                        if (loc == null) {
                            Log.w(TAG, "NATIVE GPS success but null location");
                            stopSelfSafe();
                            return;
                        }
                        Log.i(TAG, "NATIVE GPS success lat=" + loc.getLatitude() + " lng=" + loc.getLongitude() + " acc=" + loc.getAccuracy());
                        final double lat = loc.getLatitude();
                        final double lng = loc.getLongitude();
                        final double acc = loc.getAccuracy();
                        new Thread(new Runnable() {
                            @Override public void run() {
                                uploadPoint(userId, deviceId, lat, lng, acc);
                                stopSelfSafe();
                            }
                        }).start();
                    }
                })
                .addOnFailureListener(new com.google.android.gms.tasks.OnFailureListener() {
                    @Override public void onFailure(Exception e) {
                        mainHandler.removeCallbacks(watchdogRef[0]);
                        Log.e(TAG, "NATIVE GPS failure", e);
                        stopSelfSafe();
                    }
                });
        } catch (Throwable t) {
            Log.e(TAG, "NATIVE GPS request exception", t);
            stopSelfSafe();
        }
    }

    private void uploadPoint(String userId, String deviceId, double lat, double lng, double accuracy) {
        Log.i(TAG, "NATIVE upload started");
        HttpURLConnection conn = null;
        try {
            String supabaseUrl = readMetaString("SUPABASE_URL");
            String anonKey = readMetaString("SUPABASE_ANON_KEY");
            if (supabaseUrl == null || supabaseUrl.isEmpty() || anonKey == null || anonKey.isEmpty()) {
                Log.e(TAG, "NATIVE upload ABORT missing SUPABASE_URL/ANON_KEY meta-data");
                return;
            }

            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            String iso = sdf.format(new Date());

            JSONObject body = new JSONObject();
            body.put("userId", userId);
            body.put("deviceId", deviceId);
            body.put("latitude", lat);
            body.put("longitude", lng);
            body.put("accuracy", accuracy);
            body.put("timestamp", iso);
            body.put("source", "native_push_location_refresh");
            body.put("devicePlatform", "android");
            byte[] payload = body.toString().getBytes("UTF-8");

            URL url = new URL(supabaseUrl + "/functions/v1/location-refresh-upload");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(UPLOAD_TIMEOUT_MS);
            conn.setReadTimeout(UPLOAD_TIMEOUT_MS);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("apikey", anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + anonKey);
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                Log.i(TAG, "NATIVE upload success status=" + code);
            } else {
                Log.e(TAG, "NATIVE upload failure status=" + code);
            }
        } catch (Throwable t) {
            Log.e(TAG, "NATIVE upload exception", t);
        } finally {
            if (conn != null) try { conn.disconnect(); } catch (Throwable ignored) {}
        }
    }

    @Nullable
    private String readMetaString(String key) {
        try {
            return getPackageManager()
                    .getApplicationInfo(getPackageName(), PackageManager.GET_META_DATA)
                    .metaData.getString(key);
        } catch (Throwable t) {
            Log.e(TAG, "readMeta " + key + " failed", t);
            return null;
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager mgr = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (mgr == null || mgr.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Обновяване на локацията",
                NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Кратка фонова услуга за обновяване на локацията");
        ch.setShowBadge(false);
        mgr.createNotificationChannel(ch);
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Семейна локация")
                .setContentText("Обновяване на локацията...")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void stopSelfSafe() {
        if (stopped) return;
        stopped = true;
        Log.i(TAG, "NATIVE service stopped");
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                //noinspection deprecation
                stopForeground(true);
            }
        } catch (Throwable ignored) {}
        try { stopSelf(); } catch (Throwable ignored) {}
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "NATIVE onDestroy");
        super.onDestroy();
    }
}
