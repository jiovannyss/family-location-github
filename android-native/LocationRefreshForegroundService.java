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
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

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
    private static final long GPS_RETRY_BALANCED_MS = 12_000L;
    private static final int UPLOAD_TIMEOUT_MS = 15_000;
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String PREFS_USER = "fam_user_id";
    private static final String PREFS_DEVICE = "fam_device_id";
    private static final String PREFS_BG_MISSING = "fam_bg_perm_missing_at";

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

            // Диагностика: логваме background-location и състояние на GPS providers,
            // за да разберем защо Fused Location връща null при заключен екран.
            boolean bgGranted = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                bgGranted = ContextCompat.checkSelfPermission(
                        this, Manifest.permission.ACCESS_BACKGROUND_LOCATION
                ) == PackageManager.PERMISSION_GRANTED;
            }
            boolean gpsEnabled = false;
            boolean netEnabled = false;
            try {
                LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
                if (lm != null) {
                    gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
                    netEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
                }
            } catch (Throwable t) {
                Log.w(TAG, "NATIVE provider check failed", t);
            }
            Log.i(TAG, "NATIVE perms bgLocation=" + bgGranted
                    + " gpsProvider=" + gpsEnabled + " networkProvider=" + netEnabled);

            // Early abort: ако background-location липсва на Android 10+, GPS
            // активни ъпдейти ще fail-нат при заключен екран. Записваме flag,
            // който UI ще прочете и ще покаже upgrade dialog при следващо
            // отваряне на app-а.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !bgGranted) {
                try {
                    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .edit()
                        .putLong(PREFS_BG_MISSING, System.currentTimeMillis())
                        .apply();
                } catch (Throwable ignored) {}
                Log.w(TAG, "NATIVE ABORT: background location permission missing — open app settings");
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
        Log.i(TAG, "NATIVE GPS request started (active updates)");
        try {
            final FusedLocationProviderClient client =
                    LocationServices.getFusedLocationProviderClient(this);

            // Активна заявка: high accuracy, бързи интервали, единичен fix.
            final LocationRequest req = new LocationRequest.Builder(
                        Priority.PRIORITY_HIGH_ACCURACY, 1000L)
                    .setMinUpdateIntervalMillis(500L)
                    .setMaxUpdateDelayMillis(0L)
                    .setWaitForAccurateLocation(false)
                    .setMaxUpdates(1)
                    .build();

            final boolean[] handled = { false };
            final LocationCallback[] cbRef = new LocationCallback[1];
            final Runnable[] watchdogRef = new Runnable[1];

            final Runnable finishWith = new Runnable() { @Override public void run() {} };

            cbRef[0] = new LocationCallback() {
                @Override
                public void onLocationResult(LocationResult result) {
                    if (handled[0]) return;
                    Location loc = result != null ? result.getLastLocation() : null;
                    if (loc == null) {
                        Log.w(TAG, "NATIVE active update returned null");
                        return; // изчакай watchdog или следващ update
                    }
                    handled[0] = true;
                    mainHandler.removeCallbacks(watchdogRef[0]);
                    try { client.removeLocationUpdates(cbRef[0]); } catch (Throwable ignored) {}
                    Log.i(TAG, "NATIVE GPS active fix lat=" + loc.getLatitude()
                            + " lng=" + loc.getLongitude() + " acc=" + loc.getAccuracy());
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
            };

            watchdogRef[0] = new Runnable() {
                @Override public void run() {
                    if (handled[0]) return;
                    Log.w(TAG, "NATIVE GPS watchdog timeout — fallback to lastLocation");
                    try { client.removeLocationUpdates(cbRef[0]); } catch (Throwable ignored) {}
                    // Fallback: пробвай cached last location, ако има.
                    try {
                        client.getLastLocation()
                            .addOnSuccessListener(new com.google.android.gms.tasks.OnSuccessListener<Location>() {
                                @Override public void onSuccess(Location loc) {
                                    if (handled[0]) return;
                                    handled[0] = true;
                                    if (loc == null) {
                                        Log.w(TAG, "NATIVE fallback lastLocation null — abort");
                                        stopSelfSafe();
                                        return;
                                    }
                                    Log.i(TAG, "NATIVE fallback lastLocation lat=" + loc.getLatitude()
                                            + " lng=" + loc.getLongitude() + " acc=" + loc.getAccuracy());
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
                                    if (handled[0]) return;
                                    handled[0] = true;
                                    Log.e(TAG, "NATIVE fallback lastLocation failed", e);
                                    stopSelfSafe();
                                }
                            });
                    } catch (Throwable t) {
                        handled[0] = true;
                        Log.e(TAG, "NATIVE fallback exception", t);
                        stopSelfSafe();
                    }
                }
            };
            mainHandler.postDelayed(watchdogRef[0], GPS_TIMEOUT_MS);

            // BALANCED retry: ако GPS-ът не върне fix до 12 сек, паралелно
            // стартираме втора заявка с по-ниска точност (network/cell), която
            // често връща fix дори когато GPS hardware не може (закрит екран,
            // вътре в сграда). Първият който върне резултат печели.
            mainHandler.postDelayed(new Runnable() {
                @Override public void run() {
                    if (handled[0]) return;
                    Log.i(TAG, "NATIVE GPS retry with BALANCED priority");
                    try {
                        LocationRequest balanced = new LocationRequest.Builder(
                                    Priority.PRIORITY_BALANCED_POWER_ACCURACY, 1000L)
                                .setMinUpdateIntervalMillis(500L)
                                .setMaxUpdates(1)
                                .build();
                        client.requestLocationUpdates(balanced, cbRef[0], Looper.getMainLooper());
                    } catch (Throwable t) {
                        Log.w(TAG, "NATIVE BALANCED retry failed", t);
                    }
                }
            }, GPS_RETRY_BALANCED_MS);

            try {
                client.requestLocationUpdates(req, cbRef[0], Looper.getMainLooper());
            } catch (SecurityException se) {
                Log.e(TAG, "NATIVE requestLocationUpdates SecurityException", se);
                mainHandler.removeCallbacks(watchdogRef[0]);
                stopSelfSafe();
            }
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
