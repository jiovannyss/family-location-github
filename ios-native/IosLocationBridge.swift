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
public class IosLocationBridge: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {

    public let identifier = "IosLocationBridge"
    public let jsName = "IosLocationBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestForeground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlways", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSlc", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSlc", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearMissingFlag", returnType: CAPPluginReturnPromise),
    ]

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
    /// Отделен manager за еднократен fix при silent push (за да не интерферира с SLC).
    private let oneShotManager = CLLocationManager()
    private var managersConfigured = false
    private var slcStarted = false
    private var continuousStarted = false
    /// Когато requestAlways е извикан преди WhenInUse да е grant-нат,
    /// маркираме flag-а и пускаме requestAlwaysAuthorization() от
    /// delegate callback-а — иначе iOS игнорира заявката.
    private var pendingAlwaysRequest = false

    /// Pending completion handlers за active silent-push refresh заявки.
    /// iOS дава ~30s background time, след което UIBackgroundFetchResult трябва
    /// да бъде извикан. Пазим до 3 paralleling заявки.
    private var pendingPushCompletions: [(UIBackgroundFetchResult) -> Void] = []
    private var pushRefreshInFlight = false

    /// Жив plugin instance, ако Capacitor е заредил bridge-а.
    public static var sharedInstance: IosLocationBridge?
    /// Fallback native handler за silent push, дори когато JS bridge-ът не е зареден.
    private static let backgroundHandler = IosLocationBridge()

    @objc public static func sharedHandler() -> IosLocationBridge {
        let handler = sharedInstance ?? backgroundHandler
        handler.ensureManagersConfigured()
        return handler
    }

    public override func load() {
        ensureManagersConfigured()
        IosLocationBridge.sharedInstance = self
        NSLog("[\(IosLocationBridge.TAG)] loaded; current auth=\(authStatusString())")
    }

    private func ensureManagersConfigured() {
        if managersConfigured { return }
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
        // Позволи да получаваме updates на background — изисква
        // UIBackgroundModes=location и Always permission.
        if #available(iOS 9.0, *) {
            manager.allowsBackgroundLocationUpdates = true
        }
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = false
        }
        // One-shot manager за silent push — споделя delegate-а.
        oneShotManager.delegate = self
        oneShotManager.desiredAccuracy = kCLLocationAccuracyBest
        if #available(iOS 9.0, *) {
            oneShotManager.allowsBackgroundLocationUpdates = true
        }
        managersConfigured = true
    }

    /**
     * Извиква се от AppDelegate.application(_:didReceiveRemoteNotification:fetchCompletionHandler:)
     * когато получим silent push с `type=location_refresh`. Пуска еднократен
     * location request, качва резултата и вика completion (или newData/noData).
     *
     * Това е iOS аналог на Android `LocationRefreshForegroundService` —
     * работи дори когато webview-а е suspended/убит, защото се изпълнява в
     * native AppDelegate context-а с гарантираните ~30s background time.
     */
    @objc public func handleSilentLocationRefreshPush(
        completion: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        ensureManagersConfigured()
        let status = currentStatus()
        guard status == .authorizedAlways else {
            NSLog("[\(IosLocationBridge.TAG)] silent push: no location auth (\(authStatusString())) → noData")
            completion(.noData)
            return
        }
        pendingPushCompletions.append(completion)
        if pushRefreshInFlight {
            NSLog("[\(IosLocationBridge.TAG)] silent push: request already in flight → queued")
            return
        }
        pushRefreshInFlight = true
        NSLog("[\(IosLocationBridge.TAG)] silent push: requesting one-shot location")

        // Watchdog — ако нищо не дойде до 25s, върни failed (преди iOS да ни убие).
        DispatchQueue.main.asyncAfter(deadline: .now() + 25.0) { [weak self] in
            guard let self = self, self.pushRefreshInFlight else { return }
            NSLog("[\(IosLocationBridge.TAG)] silent push: watchdog timeout → failed")
            self.resolvePendingPushCompletions(.failed)
        }
        DispatchQueue.main.async { [weak self] in
            self?.oneShotManager.requestLocation()
        }
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
        if status == .notDetermined {
            // Маркирай — след callback-а от WhenInUse ще пуснем Always
            pendingAlwaysRequest = true
            DispatchQueue.main.async { self.manager.requestWhenInUseAuthorization() }
            call.resolve(["background": "denied"])
            return
        }
        // .authorizedWhenInUse → пускаме веднага системния "Always" prompt
        DispatchQueue.main.async { self.manager.requestAlwaysAuthorization() }
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

    @objc func startTracking(_ call: CAPPluginCall) {
        ensureManagersConfigured()
        let status = currentStatus()
        guard status == .authorizedAlways else {
            NSLog("[\(IosLocationBridge.TAG)] startTracking skipped: auth=\(authStatusString())")
            call.resolve(["started": false, "reason": authStatusString()])
            return
        }

        DispatchQueue.main.async {
            if !self.continuousStarted {
                self.manager.startUpdatingLocation()
                self.continuousStarted = true
                NSLog("[\(IosLocationBridge.TAG)] continuous location tracking started")
            }
            if CLLocationManager.significantLocationChangeMonitoringAvailable(), !self.slcStarted {
                self.manager.startMonitoringSignificantLocationChanges()
                self.slcStarted = true
                NSLog("[\(IosLocationBridge.TAG)] SLC monitoring started (via startTracking)")
            }
            call.resolve(["started": true])
        }
    }

    @objc func stopTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.continuousStarted {
                self.manager.stopUpdatingLocation()
                self.continuousStarted = false
            }
            if self.slcStarted {
                self.manager.stopMonitoringSignificantLocationChanges()
                self.slcStarted = false
            }
            NSLog("[\(IosLocationBridge.TAG)] continuous tracking stopped")
            call.resolve()
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
        let isPushFix = manager === oneShotManager || !pendingPushCompletions.isEmpty
        let source: String
        if isPushFix {
            source = "native_ios_push"
        } else if continuousStarted {
            source = "native_ios_continuous"
        } else {
            source = "native_ios_slc"
        }
        NSLog("[\(IosLocationBridge.TAG)] fix (\(source)) lat=\(loc.coordinate.latitude) lng=\(loc.coordinate.longitude) acc=\(loc.horizontalAccuracy)")

        if isPushFix && !pendingPushCompletions.isEmpty {
            uploadLocation(loc, source: source) { ok in
                let result: UIBackgroundFetchResult = ok ? .newData : .failed
                DispatchQueue.main.async { self.resolvePendingPushCompletions(result) }
            }
        } else {
            uploadLocation(loc, source: source)
        }
        notifyJsLocation(loc)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        NSLog("[\(IosLocationBridge.TAG)] location error: \(error.localizedDescription)")
        let nsErr = error as NSError
        if nsErr.code == CLError.denied.rawValue {
            UserDefaults.standard.set(Date().timeIntervalSince1970 * 1000, forKey: IosLocationBridge.DEFAULTS_MISSING_AT)
        }
        // Ако грешката е от one-shot заявка → резолвни pending push completions.
        if manager === oneShotManager && !pendingPushCompletions.isEmpty {
            DispatchQueue.main.async { self.resolvePendingPushCompletions(.failed) }
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        NSLog("[\(IosLocationBridge.TAG)] auth changed → \(authStatusString())")
        notifyJsAuthChange()
        // Ако имаме pending Always и току-що ни дадоха WhenInUse → пусни втория prompt
        if pendingAlwaysRequest && currentStatus() == .authorizedWhenInUse {
            pendingAlwaysRequest = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                self.manager.requestAlwaysAuthorization()
            }
        }
        // Ако вече имаме Always — стартирай continuous + SLC автоматично.
        if currentStatus() == .authorizedAlways {
            if !continuousStarted {
                self.manager.startUpdatingLocation()
                continuousStarted = true
                NSLog("[\(IosLocationBridge.TAG)] continuous tracking auto-started after auth change")
            }
            if !slcStarted && CLLocationManager.significantLocationChangeMonitoringAvailable() {
                self.manager.startMonitoringSignificantLocationChanges()
                slcStarted = true
                NSLog("[\(IosLocationBridge.TAG)] SLC auto-started after auth change")
            }
        } else if continuousStarted {
            self.manager.stopUpdatingLocation()
            continuousStarted = false
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

    private func resolvePendingPushCompletions(_ result: UIBackgroundFetchResult) {
        let cbs = pendingPushCompletions
        pendingPushCompletions.removeAll()
        pushRefreshInFlight = false
        cbs.forEach { $0(result) }
    }

    /**
     * POST към location-refresh-upload edge function. Подобно на Android-ския
     * native upload — без user JWT, използва (user_id, device_id) pair-а
     * валидиран срещу push_tokens row.
     */
    private func uploadLocation(_ loc: CLLocation, source: String = "native_ios_slc", completion: ((Bool) -> Void)? = nil) {
        let defaults = UserDefaults.standard
        guard let userId = defaults.string(forKey: IosLocationBridge.DEFAULTS_USER),
              let deviceId = defaults.string(forKey: IosLocationBridge.DEFAULTS_DEVICE),
              let baseUrl = defaults.string(forKey: IosLocationBridge.DEFAULTS_SUPABASE_URL),
              !userId.isEmpty, !deviceId.isEmpty, !baseUrl.isEmpty else {
            NSLog("[\(IosLocationBridge.TAG)] upload SKIP: missing creds in UserDefaults")
            completion?(false)
            return
        }
        let platform = defaults.string(forKey: IosLocationBridge.DEFAULTS_DEVICE_PLATFORM) ?? "ios"

        guard let url = URL(string: "\(baseUrl)/functions/v1/location-refresh-upload") else {
            completion?(false)
            return
        }
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
            "source": source,
            "devicePlatform": platform
        ]
        guard let payload = try? JSONSerialization.data(withJSONObject: body) else {
            completion?(false)
            return
        }
        req.httpBody = payload

        let task = URLSession.shared.dataTask(with: req) { data, response, error in
            if let error = error {
                NSLog("[\(IosLocationBridge.TAG)] upload FAILED: \(error.localizedDescription)")
                completion?(false)
                return
            }
            if let http = response as? HTTPURLResponse {
                NSLog("[\(IosLocationBridge.TAG)] upload status=\(http.statusCode)")
                completion?(http.statusCode >= 200 && http.statusCode < 300)
            } else {
                completion?(false)
            }
        }
        task.resume()
    }
}

