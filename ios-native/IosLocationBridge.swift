import Foundation
import Capacitor
import CoreLocation
import UIKit

/**
 * Native iOS bridge — паралел на Android `BgLocationBridge`.
 *
 * Експортира към JS:
 *   - check() → { foreground, background, missingDetectedAt }
 *   - requestForeground() → { foreground }
 *   - requestAlways() → { background }   (показва системния "Always" prompt)
 *   - openAppSettings() → отваря Settings → Family Location
 *   - startSlc()  → Significant Location Changes (буди убитото app)
 *   - stopSlc()
 *   - clearMissingFlag()
 *
 * Когато SLC delegate-ът получи fix, праща POST към
 * `<SUPABASE_URL>/functions/v1/location-refresh-upload` използвайки
 * userId/deviceId, записани в UserDefaults от JS layer-а
 * (същата конвенция като Android `CapacitorStorage`).
 *
 * Регистрира се в AppDelegate чрез `bridge.registerPluginInstance(IosLocationBridge())`.
 */
@objc(IosLocationBridge)
public class IosLocationBridge: CAPPlugin, CLLocationManagerDelegate {

    private static let TAG = "FamLocIOS"
    // @capacitor/preferences плъгинът на iOS префиксира всички ключове с
    // "_capacitor_" в UserDefaults.standard. Затова четем с този префикс.
    private static let PREFS_PREFIX = "_capacitor_"
    private static let DEFAULTS_USER = "_capacitor_fam_user_id"
    private static let DEFAULTS_DEVICE = "_capacitor_fam_device_id"
    private static let DEFAULTS_SUPABASE_URL = "_capacitor_fam_supabase_url"
    private static let DEFAULTS_DEVICE_PLATFORM = "_capacitor_fam_device_platform"
    private static let DEFAULTS_MISSING_AT = "fam_bg_perm_missing_at"

    private let manager = CLLocationManager()
    private var slcStarted = false
    /// Когато requestAlways е извикан преди WhenInUse да е grant-нат,
    /// маркираме flag-а и пускаме requestAlwaysAuthorization() от
    /// delegate callback-а — иначе iOS игнорира заявката.
    private var pendingAlwaysRequest = false

    public override func load() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.pausesLocationUpdatesAutomatically = false
        // Позволи да получаваме updates на background — изисква
        // UIBackgroundModes=location и Always permission.
        if #available(iOS 9.0, *) {
            manager.allowsBackgroundLocationUpdates = true
        }
        NSLog("[\(IosLocationBridge.TAG)] loaded; current auth=\(authStatusString())")
    }

    // MARK: - JS API

    @objc func check(_ call: CAPPluginCall) {
        let status = currentStatus()
        let foreground = (status == .authorizedAlways || status == .authorizedWhenInUse) ? "granted" : "denied"
        let background = (status == .authorizedAlways) ? "granted" : "denied"
        let missingAt = UserDefaults.standard.double(forKey: IosLocationBridge.DEFAULTS_MISSING_AT)
        call.resolve([
            "foreground": foreground,
            "background": background,
            "rawStatus": authStatusString(),
            "missingDetectedAt": missingAt
        ])
    }

    @objc func requestForeground(_ call: CAPPluginCall) {
        let status = currentStatus()
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
            // Apple не дава sync resolve — връщаме текущото състояние.
        }
        call.resolve(["foreground": status == .denied ? "denied" : "granted"])
    }

    @objc func requestAlways(_ call: CAPPluginCall) {
        let status = currentStatus()
        if status == .authorizedAlways {
            call.resolve(["background": "granted"])
            return
        }
        // iOS показва "Always" prompt само ако вече има WhenInUse.
        // Ако няма — първо WhenInUse, после Always (системно).
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.requestAlwaysAuthorization()
        call.resolve(["background": currentStatus() == .authorizedAlways ? "granted" : "denied"])
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString),
               UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url, options: [:]) { ok in
                    if ok { call.resolve() }
                    else { call.reject("Cannot open settings") }
                }
            } else {
                call.reject("openSettingsURLString unavailable")
            }
        }
    }

    @objc func startSlc(_ call: CAPPluginCall) {
        guard CLLocationManager.significantLocationChangeMonitoringAvailable() else {
            call.reject("SLC not available on this device")
            return
        }
        manager.startMonitoringSignificantLocationChanges()
        slcStarted = true
        NSLog("[\(IosLocationBridge.TAG)] SLC monitoring started")
        call.resolve(["started": true])
    }

    @objc func stopSlc(_ call: CAPPluginCall) {
        if slcStarted {
            manager.stopMonitoringSignificantLocationChanges()
            slcStarted = false
        }
        call.resolve()
    }

    @objc func clearMissingFlag(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: IosLocationBridge.DEFAULTS_MISSING_AT)
        call.resolve()
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        NSLog("[\(IosLocationBridge.TAG)] SLC fix lat=\(loc.coordinate.latitude) lng=\(loc.coordinate.longitude) acc=\(loc.horizontalAccuracy)")
        uploadLocation(loc)
        notifyJsLocation(loc)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        NSLog("[\(IosLocationBridge.TAG)] location error: \(error.localizedDescription)")
        // Маркираме flag — UI ще покаже banner че background не работи.
        let nsErr = error as NSError
        if nsErr.code == CLError.denied.rawValue {
            UserDefaults.standard.set(Date().timeIntervalSince1970 * 1000, forKey: IosLocationBridge.DEFAULTS_MISSING_AT)
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        NSLog("[\(IosLocationBridge.TAG)] auth changed → \(authStatusString())")
        notifyJsAuthChange()
        // Ако вече имаме Always и не сме стартирали SLC — стартирай автоматично.
        if currentStatus() == .authorizedAlways && !slcStarted &&
           CLLocationManager.significantLocationChangeMonitoringAvailable() {
            manager.startMonitoringSignificantLocationChanges()
            slcStarted = true
            NSLog("[\(IosLocationBridge.TAG)] SLC auto-started after auth change")
        }
    }

    // MARK: - Helpers

    private func currentStatus() -> CLAuthorizationStatus {
        if #available(iOS 14.0, *) {
            return manager.authorizationStatus
        } else {
            return CLLocationManager.authorizationStatus()
        }
    }

    private func authStatusString() -> String {
        switch currentStatus() {
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .authorizedAlways: return "authorizedAlways"
        case .authorizedWhenInUse: return "authorizedWhenInUse"
        @unknown default: return "unknown"
        }
    }

    private func notifyJsLocation(_ loc: CLLocation) {
        notifyListeners("location", data: [
            "lat": loc.coordinate.latitude,
            "lng": loc.coordinate.longitude,
            "accuracy": loc.horizontalAccuracy,
            "timestamp": loc.timestamp.timeIntervalSince1970 * 1000,
            "source": "ios_slc"
        ])
    }

    private func notifyJsAuthChange() {
        notifyListeners("authChange", data: [
            "status": authStatusString()
        ])
    }

    /**
     * POST към location-refresh-upload edge function. Подобно на Android-ския
     * native upload — без user JWT, използва (user_id, device_id) pair-а
     * валидиран срещу push_tokens row.
     */
    private func uploadLocation(_ loc: CLLocation) {
        let defaults = UserDefaults.standard
        guard let userId = defaults.string(forKey: IosLocationBridge.DEFAULTS_USER),
              let deviceId = defaults.string(forKey: IosLocationBridge.DEFAULTS_DEVICE),
              let baseUrl = defaults.string(forKey: IosLocationBridge.DEFAULTS_SUPABASE_URL),
              !userId.isEmpty, !deviceId.isEmpty, !baseUrl.isEmpty else {
            NSLog("[\(IosLocationBridge.TAG)] upload SKIP: missing creds in UserDefaults")
            return
        }
        let platform = defaults.string(forKey: IosLocationBridge.DEFAULTS_DEVICE_PLATFORM) ?? "ios"

        guard let url = URL(string: "\(baseUrl)/functions/v1/location-refresh-upload") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 15

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let body: [String: Any] = [
            "userId": userId,
            "deviceId": deviceId,
            "latitude": loc.coordinate.latitude,
            "longitude": loc.coordinate.longitude,
            "accuracy": loc.horizontalAccuracy,
            "timestamp": formatter.string(from: loc.timestamp),
            "source": "native_ios_slc",
            "devicePlatform": platform
        ]
        guard let payload = try? JSONSerialization.data(withJSONObject: body) else { return }
        req.httpBody = payload

        let task = URLSession.shared.dataTask(with: req) { data, response, error in
            if let error = error {
                NSLog("[\(IosLocationBridge.TAG)] upload FAILED: \(error.localizedDescription)")
                return
            }
            if let http = response as? HTTPURLResponse {
                NSLog("[\(IosLocationBridge.TAG)] upload status=\(http.statusCode)")
            }
        }
        task.resume()
    }
}
