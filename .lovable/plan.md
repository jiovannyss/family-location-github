
# iOS background location — паритет с Android

## Защо ти трябва Mac
iOS приложенията **не могат** да се компилират никъде освен на macOS — Xcode (Apple's compiler + simulator + signing tools) върви само на Mac. Linux/Windows физически не могат. Ще използваме MacBook-а за:
1. `npx cap add ios` + `npx cap sync ios`
2. Отваряне на проекта в Xcode (`npx cap open ios`)
3. Signing (Apple ID), Capabilities, Info.plist
4. Build → симулатор / физически iPhone / TestFlight

## Какво вече е готово в repo-то
- `capacitor.config.ts` — iOS секцията.
- `resources/IOS_READINESS.md` — checklist за Info.plist, Capabilities, App ID.
- `send-push` edge функцията използва **FCM v1**, който маршрутизира автоматично към **APNs** (Apple) когато токенът е iOS — т.е. същият код, който праща Android push, ще праща и iOS push, **след като качим APNs Auth Key (.p8) в Firebase Console**.
- Foreground tracking чрез `@capacitor/geolocation` вече работи на iOS off-the-shelf.

## Какво липсва за паритет с Android

На Android правим: **FCM data push → буди native foreground service → взима 1 GPS fix → upload → spi**. На iOS имаме два паралелни механизма за същото, защото iOS е по-рестриктивен:

### Механизъм A — Continuous background tracking (app не е force-killed)
`@capacitor/geolocation` `watchPosition` с `enableHighAccuracy` **продължава** да тиктака на заключен екран и в background, ако в Xcode е включен `UIBackgroundModes: location`. Активира се автоматично, без push.

### Механизъм B — Wake-up след force-kill: Significant Location Changes (SLC)
Apple дава **един-единствен** механизъм, който буди убито приложение при движение: `CLLocationManager.startMonitoringSignificantLocationChanges()`. Работи на ~500м granularity, нула батерия. Това е iOS-аналогът на Android-ския background service.

### Механизъм C — On-demand push refresh (peer натиска бутон „опресни")
Silent push (`content-available: 1` + `apns-priority: 5`) → iOS буди приложението за ~30s background time → правим `requestLocation()` → upload. Работи когато приложението е alive (background/closed-but-suspended); **не** работи след force-quit (Apple ограничение, нищо не може да се направи).

## План за изпълнение

### 1. Frontend конфиг
- `capacitor.config.ts` — добавяме `ios.backgroundColor`, нищо повече.
- `src/services/backgroundGeo.ts` — `@capacitor-community/background-geolocation` вече се използва и работи на iOS, но **трябва** на iOS да поискаме `Always` permission (не само `When In Use`). Логиката от `backgroundLocationPermission.ts` ще се разшири с iOS branch, който вика Geolocation requestPermissions с `aliases: ['location']` → след това проверява дали iOS статусът е „authorizedAlways" (ако е „authorizedWhenInUse", показваме upgrade dialog аналогично на Android).

### 2. Native iOS Swift plugin: `SlcBridge`
Създаваме `ios-native/SlcBridge.swift` (паралел на `BgLocationBridge.java`):
- `start()` → `CLLocationManager.startMonitoringSignificantLocationChanges()`
- `stop()` → `stopMonitoringSignificantLocationChanges()`
- delegate `didUpdateLocations` → POST към `/functions/v1/location-refresh-upload` (същата edge функция, която Android service-ът ползва)
- Чете JWT token от `UserDefaults` (записан от JS при login)
- Регистрира се чрез `AppDelegate.swift` patch
- Скрипт `scripts/ios-prepare.mjs` — паралел на `android-prepare.mjs` — копира Swift файла в `ios/App/App/` и инжектира registerPlugin в `AppDelegate`

### 3. Push wake-up (механизъм C)
- `send-push/index.ts` — вече праща към APNs автоматично. Добавяме само нов code-path: когато payload е „location_refresh" (peer натиска бутон), праща `apns: { payload: { aps: { 'content-available': 1 } } }` БЕЗ alert/sound — silent push.
- В `src/services/push.ts` (или нов native iOS handler) при получаване на silent push с `type=location_refresh` → стартира `Geolocation.getCurrentPosition()` → upload през съществуващия `uploadLocationPoint`.

### 4. Info.plist & Xcode (ръчни стъпки на Mac-а)
Документираме в нов `resources/IOS_BACKGROUND_SETUP.md`:
1. Отвори `ios/App/App.xcworkspace` в Xcode
2. Signing & Capabilities → Team
3. + Capability → **Push Notifications**
4. + Capability → **Background Modes** → отметни:
   - Location updates
   - Background fetch
   - Remote notifications
5. Info.plist → добави `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationWhenInUseUsageDescription` (текстовете вече са в `IOS_READINESS.md`)
6. APNs Auth Key:
   - Apple Developer Portal → Keys → + → Apple Push Notifications service
   - Свали `.p8` файл (само веднъж — пази го)
   - Firebase Console → Project Settings → Cloud Messaging → Apple app configuration → Upload `.p8` + Key ID + Team ID
7. `pod install` в `ios/App` (Xcode го прави автоматично при cap sync)

### 5. UI — споделено с Android
`BackgroundUpgradeDialog.tsx` и `BackgroundPermissionBanner.tsx` ще се използват и за iOS, само със сменени текстове („Винаги" вместо „Позволи винаги") и iOS път до Settings (`UIApplication.openSettingsURLString` чрез native bridge).

## Технически детайли

```text
┌─────────────────────────────────────────────────────────┐
│  iOS background location architecture                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  App alive (foreground or background):                  │
│    @capacitor/geolocation watchPosition → upload        │
│    + UIBackgroundModes: location → tiktak на lock       │
│                                                         │
│  App force-killed:                                      │
│    SlcBridge (Swift) → SLC delegate fires → upload      │
│    (1 update / ~500m, нула батерия)                     │
│                                                         │
│  Peer натиска „опресни":                                │
│    send-push → APNs silent (content-available: 1) →     │
│    iOS буди app за 30s → getCurrentPosition → upload    │
│    (само ако app не е force-killed)                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Какво ТИ ще направиш на Mac-а (по стъпки)

```bash
# 1. Клонирай / git pull
git pull

# 2. Инсталирай dependencies
npm install

# 3. Добави iOS платформа (само първия път)
npx cap add ios

# 4. Build + sync
npm run build
npx cap sync ios

# 5. Подготви native iOS файлове (ако е сложен скрипт):
npm run ios:prepare      # ще го създадем

# 6. Отвори в Xcode
npx cap open ios

# 7. В Xcode: Signing, Capabilities, Info.plist (по checklist)

# 8. Run на симулатор (⌘R) или физически iPhone (избира се target горе)
```

При следващи промени от моя страна повтаряш само 1, 4, 5, 8.

## Какво НЕ е включено (последваща задача, ако пожелаеш)
- App Store Connect metadata, screenshots, privacy nutrition label
- TestFlight beta distribution
- App icons и launch screen за iOS

---
**Одобри плана за да започна имплементацията** (стъпки 1, 2, 3 от секция „План за изпълнение" — всичко в repo-то; ръчните Xcode стъпки ще ги документирам).
