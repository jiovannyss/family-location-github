package __PACKAGE__;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Native bridge за пълна проверка/заявка на ACCESS_BACKGROUND_LOCATION
 * (нещо което @capacitor/geolocation не покрива добре на Android 11+),
 * плюс отваряне на системните настройки за приложението.
 *
 * Използва се от src/services/backgroundLocationPermission.ts.
 */
@CapacitorPlugin(
    name = "BgLocationBridge",
    permissions = {
        @Permission(
            alias = "background",
            strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }
        )
    }
)
public class BgLocationBridge extends Plugin {

    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String FLAG_KEY = "fam_bg_perm_missing_at";

    @PluginMethod
    public void check(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("foreground", hasFineLocation() ? "granted" : "denied");
        ret.put("background", hasBackgroundLocation() ? "granted" : "denied");
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        // Прочитаме flag от native service-а ако е failвал поради липсваща permission
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, 0);
            long ts = prefs.getLong(FLAG_KEY, 0L);
            ret.put("missingDetectedAt", ts);
        } catch (Throwable ignored) {
            ret.put("missingDetectedAt", 0L);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void clearMissingFlag(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, 0);
            prefs.edit().remove(FLAG_KEY).apply();
        } catch (Throwable ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void requestBackground(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Преди Android 10 background location не е отделна permission
            JSObject ret = new JSObject();
            ret.put("background", "granted");
            call.resolve(ret);
            return;
        }
        if (hasBackgroundLocation()) {
            JSObject ret = new JSObject();
            ret.put("background", "granted");
            call.resolve(ret);
            return;
        }
        // ВАЖНО: на Android 11+ requestPermissions за BACKGROUND обикновено НЕ
        // показва диалог — системата отваря Settings. Това е по дизайн.
        requestPermissionForAlias("background", call, "bgPermCallback");
    }

    @PermissionCallback
    private void bgPermCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("background", hasBackgroundLocation() ? "granted" : "denied");
        call.resolve(ret);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Throwable t) {
            call.reject("Cannot open settings: " + t.getMessage());
        }
    }

    private boolean hasFineLocation() {
        return ContextCompat.checkSelfPermission(
            getContext(), Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasBackgroundLocation() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Преди Android 10 background = foreground
            return hasFineLocation();
        }
        return ContextCompat.checkSelfPermission(
            getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION
        ) == PackageManager.PERMISSION_GRANTED;
    }
}
