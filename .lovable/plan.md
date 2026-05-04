## Какво открих

iOS workflow-ът (`.github/workflows/build-ios.yml`) прави `bunx cap add ios` при всеки run, което създава девствен native проект със:
- **Default иконата** на Capacitor (бял квадрат) — `resources/icon.png` НЕ се генерира за iOS, само за Android.
- **Празен Info.plist** без `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription` и без `UIBackgroundModes`.

### Защо това крашва приложението

iOS **силово terminate-ва** всяко app, което извика location API без съответния usage-description ключ в Info.plist. Когато потребителят натисне "Споделяне", се извиква `@capacitor-community/background-geolocation` → иска `Always` permission → iOS вижда, че липсва `NSLocationAlwaysAndWhenInUseUsageDescription` → **краш с SIGABRT**. След това приложението влиза в loop където при стартиране отново се опитва да възстанови sharing state, отново краш.

### Защо иконата е default

Android workflow има стъпка `bunx @capacitor/assets generate` от `resources/icon.png`. iOS workflow я няма, затова Capacitor вкарва placeholder иконата си.

---

## План за поправка

### 1. Добавяне на стъпка за генериране на икони в iOS workflow

След `bunx cap sync ios`, преди build-а:

```yaml
- name: Generate iOS icons & splash from resources/
  run: |
    bunx @capacitor/assets generate \
      --ios \
      --iconBackgroundColor '#2A9D8F' \
      --iconBackgroundColorDark '#2A9D8F' \
      --assetPath resources
```

Това ще препише `ios/App/App/Assets.xcassets/AppIcon.appiconset/` с правилните размери от `resources/icon.png`.

### 2. Patch на Info.plist с location & background ключове

Нова стъпка след `cap sync`, която чрез `PlistBuddy` добавя задължителните ключове (вече описани в `resources/IOS_READINESS.md`):

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`  ← **критично, без него = краш**
- `NSLocationAlwaysUsageDescription`  (legacy, препоръчан от Apple)
- `UIBackgroundModes` array с: `location`, `fetch`, `remote-notification`

Текстовете на български са вече подготвени в `IOS_READINESS.md`. Скриптът ще е idempotent (`Add` или `Set`).

### 3. Добавяне на Push Notifications & Background Modes entitlement

Освен Info.plist, iOS изисква и `App.entitlements` файл с:
- `aps-environment` = `production`
- (UIBackgroundModes се чете от Info.plist, но Push capability трябва entitlement)

Workflow-ът ще генерира/патчне `ios/App/App/App.entitlements` и ще го свърже в `App.xcodeproj` (чрез ruby `xcodeproj` gem, който вече се използва за signing patch-а).

> Забележка: provisioning profile-ът, който използваш, **трябва вече** да включва Push Notifications capability в Apple Developer Portal. Ако не — ще трябва да го регенерираш там и да обновиш `IOS_PROVISIONING_PROFILE_BASE64` secret-а. Ще ти кажа как да провериш.

### 4. (По избор) Bump на версия

След промените първият build за TestFlight ще трябва да е с нов CFBundleVersion — това вече се прави автоматично от `github.run_number`.

---

## Файлове, които ще се променят

- `.github/workflows/build-ios.yml` — добавени 3 нови стъпки (icons, Info.plist patch, entitlements patch)

## Какво трябва да направиш ти след промените

1. Пускаш билд с `build_type: validate` — проверяваш, че `.ipa` се изгражда без грешка.
2. Пускаш билд с `build_type: testflight`.
3. Тестерите **деинсталират старата версия** от iPhone-а (важно — старата е "счупена" с default икона и без permission keys, iOS може да кешира state).
4. Инсталират новата от TestFlight → при включване на Sharing трябва да се появи Apple permission dialog с твоя BG текст вместо краш.

Ако след това все още крашва — ще погледнем crash log-а от Xcode → Window → Devices and Simulators → View Device Logs.