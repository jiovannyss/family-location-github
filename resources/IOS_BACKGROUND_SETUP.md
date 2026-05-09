# iOS Background Location — Setup Guide (Mac)

Това е **пълният стъпков ръководство** за подкарване на iOS версията на Семейна
Локация с background location, push notifications и Significant Location Changes.

> ⚠️ Всичко по-долу се прави на **macOS** с инсталиран **Xcode 15+**.
> На Windows/Linux не може — Apple не позволява iOS компилация другаде.

---

## Архитектура — какво работи и кога

```
┌──────────────────────────────────────────────────────────────┐
│ Сценарий                  │ Механизъм                        │
├──────────────────────────────────────────────────────────────┤
│ App отворен               │ @capacitor/geolocation watch     │
│ App минимизиран           │ @capacitor-community/bg-geo +    │
│                           │ UIBackgroundModes:location       │
│ Заключен екран            │ Същото (Always permission)       │
│ App force-quit, движи се  │ IosLocationBridge → SLC          │
│                           │ (~500m granularity)              │
│ Peer натиска „опресни"    │ APNs silent push (content-       │
│  и app е alive            │ available:1) → JS handler →      │
│                           │ getCurrentPosition → upload      │
│ Peer „опресни" + force-   │ ❌ Не работи (Apple ограничение) │
│  quit                     │ → SLC ще даде следващ fix при    │
│                           │   следващото движение            │
└──────────────────────────────────────────────────────────────┘
```

---

## Стъпка 1 — Първоначален setup (само първия път)

```bash
git pull
npm install
npx cap add ios          # създава ios/ папка
npm run mobile:build     # vite build && cap sync
npm run ios:prepare      # patch на Info.plist + копира Swift bridge + patch на AppDelegate
```

`ios:prepare` ще:
- Добави `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`,
  `NSLocationAlwaysUsageDescription`, `NSUserNotificationsUsageDescription` в Info.plist
- Добави `UIBackgroundModes: [location, fetch, remote-notification]`
- Копира `ios-native/IosLocationBridge.swift` → `ios/App/App/`
- Patch-не `AppDelegate.swift` да регистрира `IosLocationBridge` plugin

---

## Стъпка 2 — Xcode конфигурация (ръчно, еднократно)

```bash
npx cap open ios
```

Когато Xcode се отвори:

### 2.1 Signing
1. Избери таргет **App** в навигатора
2. Таб **Signing & Capabilities**
3. Team: твоя Apple Developer акаунт (free акаунт работи за устройство, но не за TestFlight)
4. Bundle Identifier: трябва да е `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76` (вече е)
5. ✅ Automatically manage signing

### 2.2 Capabilities
Натисни **+ Capability** и добави:

- ✅ **Push Notifications** — добавя `aps-environment` в `App.entitlements`
- ✅ **Background Modes** — отметни:
  - ✅ Location updates
  - ✅ Background fetch
  - ✅ Remote notifications

### 2.3 Compile Sources
Увери се че `IosLocationBridge.swift` е добавен към компилирането:
- В навигатора ляво: разшири **App → App** група
- Намери `IosLocationBridge.swift` (трябва да е там след `npm run ios:prepare`)
- Селектирай го и провери в десния панел че **Target Membership: App** е отметнат

Ако файлът не се вижда → **File → Add Files to "App"…** → избери
`ios/App/App/IosLocationBridge.swift` → Target: App.

---

## Стъпка 3 — APNs (Apple Push Notifications) Auth Key

За да работят push notifications от наш сървър:

### 3.1 Apple Developer Portal
1. Иди на [developer.apple.com → Certificates, Identifiers & Profiles → Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Натисни **+** → име: "Family Location APNs" → отметни **Apple Push Notifications service (APNs)** → Continue → Register
3. **Свали `.p8` файла — ВЕДНЪЖ. Apple няма да ти го даде втори път.** Запази на сигурно място.
4. Запиши:
   - **Key ID** (10 знака, виждаш го в Keys секцията)
   - **Team ID** (10 знака, горе вдясно в Account)

### 3.2 Firebase Console
Нашият push pipeline използва Firebase Cloud Messaging (FCM) v1, което маршрутизира
автоматично към APNs за iOS токените.

1. Отвори [Firebase Console](https://console.firebase.google.com/) → твоят проект
2. ⚙️ Project Settings → таб **Cloud Messaging**
3. Скролни до **Apple app configuration** → ако още няма iOS app → бутон **Add app** → iOS
   - Bundle ID: `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`
   - App nickname: Family Location iOS
   - **Не е нужен `GoogleService-Info.plist`** — ние използваме FCM v1 със service account, не legacy SDK
4. В секцията **Apple app configuration** → APNs Authentication Key → **Upload**
   - Качи `.p8` файла
   - Key ID и Team ID от стъпка 3.1

> Готово. Същият `send-push` edge function, който праща към Android, сега
> ще праща и към iOS токените.

---

## Стъпка 4 — Build и тест

### 4.1 Симулатор
- В Xcode избери симулатор горе (например iPhone 15)
- ⌘R за run
- ⚠️ Симулаторът **не получава push notifications** в pre-Xcode-14 versions, но в съвременните
  работи ако пуснеш .apns файл върху прозореца. По-добре — тествай на физическо устройство.

### 4.2 Физически iPhone
1. Свържи го с USB
2. Първия път: на телефона **Settings → General → VPN & Device Management** → довери developer акаунта
3. В Xcode избери устройството горе → ⌘R

### 4.3 Какво очакваш да видиш
1. Първия път приложението иска **„Allow While Using App"** prompt
2. Когато включиш Споделяне на локацията → след малко се показва **„Change to Always Allow"** prompt
3. Ако пропуснеш втория prompt → жълт banner на главния екран → бутон „Отвори настройки" → ръчно избираш „Винаги"
4. След като дадеш Always:
   - Foreground: real-time updates
   - Background/locked: продължават updates
   - Force-quit + движение >500m: SLC буди приложението и качва нов location
5. От PushDiagnostics → бутон **Test location_refresh** — праща silent push към себе си → виждаш `[FamLocIOS]` логове в Xcode конзолата

---

## При следваща промяна (workflow)

Когато получиш нови промени от Lovable:

```bash
git pull
npm install                # ако има нови dependencies
npm run mobile:build       # vite build + cap sync
npm run ios:prepare        # ако има промени в нативния код
# в Xcode → ⌘R
```

---

## Troubleshooting

### „Build failed: IosLocationBridge.swift not found"
→ Стъпка 2.3 — провери Target Membership.

### Жълтият banner не изчезва след Allow Always
→ Затвори и отвори app-а. `useBackgroundPermissionWatcher` polling-ва на 3 сек.

### Push не идва на iOS
1. Провери в Xcode конзолата за `[FamLocIOS] auth changed` и за FCM token регистрация
2. Провери във Firebase → Cloud Messaging → дали .p8 е качен правилно
3. Push Notifications capability добавен ли е в Xcode?
4. Тествай със **Test Notification push** от PushDiagnostics — ако и тя не работи,
   проблемът е в APNs, не в твоя код

### SLC не се задейства след force-quit
- iOS изисква **движение от поне ~500 метра** за да задейства SLC
- Battery saver / Low Power Mode може да забави
- `CLLocationManager.allowsBackgroundLocationUpdates = true` изисква Always
  permission + Background Modes:Location capability — провери и двете

### `npm run ios:prepare` failед: „ios/App не съществува"
→ Първо `npx cap add ios`.

---

## Какво НЕ е включено

- App Store Connect metadata, screenshots, App Privacy nutrition label
- TestFlight beta distribution setup
- App icons (1024×1024 marketing icon + sizes) и Launch Screen
- Локализация на permission strings на английски (текстовете в момента са BG)

Тези са следваща стъпка преди реално публикуване в App Store.
