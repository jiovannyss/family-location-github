## Контекст и важно ограничение от Android

На **Android 11+ (API 30+)** Google НЕ позволява системният prompt да показва опция „Allow all the time" заедно с другите опции. Това е твърдо правило на платформата — не може да се заобиколи нито с код, нито с конфигурация, нито с друг permission API. Системата винаги показва само:

- Докато използвам приложението
- Само този път
- Откажи

За да получим „Allowed all the time", Android задължава **двустъпков (incremental) flow**:

1. Първо се иска `ACCESS_FINE_LOCATION` (foreground) → потребителят избира една от трите опции горе.
2. Едва след като foreground е дадено, приложението може да поиска `ACCESS_BACKGROUND_LOCATION` отделно. На Android 11+ това **НЕ показва диалог** — операционната система отваря директно екрана с настройки на приложението, където има 4-та опция „Allow all the time", и потребителят трябва ръчно да я избере.

Затова не можем „да я има тази опция в първия prompt и да е маркирана по дифолт" — това е забранено от Google. Това, което **можем** и **трябва** да направим, е да водим потребителя през този двустъпков процес с ясни обяснения на български на всяка стъпка.

---

## План: ясен onboarding за background location

### Step 1 — Подобрен rationale (преди първия системен prompt)

Файл: `src/components/BackgroundLocationRationale.tsx`

Добавяме секция, която предупреждава предварително, че:
- Системният прозорец ще покаже **3 опции** (без „Винаги")
- Това е нормално за Android 11+
- След като дадете „Докато използвам приложението", ще ви водим към втора стъпка за „Винаги"
- Без „Винаги" другите членове **няма да виждат локацията ви, когато екранът е заключен или приложението е затворено**

### Step 2 — Реална проверка за background permission след foreground prompt

Нов файл: `src/services/backgroundLocationPermission.ts`

Функция `ensureBackgroundLocation()` която:
1. Проверява текущото състояние през `Geolocation.checkPermissions()` (Capacitor връща `coarseLocation` и `location`).
2. На native + Android, ако foreground е granted, проверява чрез нативен bridge дали `ACCESS_BACKGROUND_LOCATION` е дадено. Ако Capacitor не разкрива това поле директно, ще използваме малък custom Capacitor plugin метод в съществуващия native код (или ще четем PackageManager.checkPermission).
3. Връща `{ foreground: 'granted'|'denied', background: 'granted'|'denied'|'unknown' }`.

Интеграция в `SharingToggle.tsx`:
- След `proceedToggle(true)` извикваме `ensureBackgroundLocation()`.
- Ако `background !== 'granted'` → показваме нов диалог **`BackgroundUpgradeDialog`** (Step 3).

### Step 3 — Втори диалог: „Активирайте 'Винаги' за пълно споделяне"

Нов файл: `src/components/BackgroundUpgradeDialog.tsx`

Съдържание (BG):
- Заглавие: „Още една стъпка за пълно споделяне"
- Обяснение: „В момента членовете на кръга виждат локацията ви само когато приложението е отворено. За да я виждат и при заключен екран, изберете **'Allow all the time' / 'Позволи винаги'** в настройките."
- Визуален guide (3 малки стъпки с икони): Settings → Permissions → Location → Allow all the time
- Бутон **„Отвори настройки"** → използва `@capacitor/app` `App.openSettings()` или нативен intent `ACTION_APPLICATION_DETAILS_SETTINGS`
- Бутон „По-късно"

Запомняме в storage `bg_upgrade_prompt_shown_at` за да не спамим — пита се пак след 7 дни ако още не е дадено.

### Step 4 — Early abort в native service когато bgLocation липсва

Файл: `android-native/LocationRefreshForegroundService.java`

Когато service-ът стартира и засече `bgLocation=false`:
- Логва ясно: `NATIVE ABORT: background location permission missing`
- Спира service-а веднага (без да чака 30s GPS timeout)
- Записва в SharedPreferences flag `bg_perm_missing=true` с timestamp
- При следващото отваряне на app-а, hook чете този flag и автоматично показва `BackgroundUpgradeDialog` с текст „Засякохме, че кръгът ви е поискал локацията ви, но нямахме нужното разрешение."

### Step 5 — Постоянен banner в Index.tsx ако background липсва

Малък warning banner над картата (само на Android, само ако sharing=true и background!=granted):

> ⚠️ Локацията се споделя само докато приложението е отворено. [Активирай за заключен екран →]

Кликът отваря `BackgroundUpgradeDialog`.

---

## Технически детайли (за разработчика)

**Двустъпков permission request на Android 11+**

```text
User toggles "Споделяне" ON
        │
        ▼
┌─────────────────────────────┐
│ BackgroundLocationRationale │  (нашият UI prompt — обяснява и предупреждава)
└─────────────────────────────┘
        │ Accept
        ▼
Geolocation.requestPermissions({ permissions: ['location'] })
        │
        ▼
[OS prompt: While using / Once / Deny]
        │ While using
        ▼
ensureBackgroundLocation() → background === 'denied'
        │
        ▼
┌──────────────────────────┐
│ BackgroundUpgradeDialog  │  (втори UI prompt — обяснява защо и как)
└──────────────────────────┘
        │ "Open settings"
        ▼
App.openSettings()  →  потребителят ръчно избира "Allow all the time"
```

**Защо НЕ можем да поискаме background директно:**
Цитат от Android docs (API 30+): *„The system permission dialog doesn't include the 'Allow all the time' option. Instead, users must enable background location on a settings page."* Опит за `requestPermissions(['ACCESS_BACKGROUND_LOCATION'])` без foreground вече дадено → автоматичен deny без prompt.

**Файлове, които ще се променят:**
- `src/components/BackgroundLocationRationale.tsx` — добавя секция за двустъпковия flow
- `src/components/BackgroundUpgradeDialog.tsx` — НОВ
- `src/services/backgroundLocationPermission.ts` — НОВ
- `src/components/SharingToggle.tsx` — извиква `ensureBackgroundLocation` след success
- `src/pages/Index.tsx` — banner ако bg липсва
- `android-native/LocationRefreshForegroundService.java` — early abort + flag в SharedPreferences
- `scripts/patch-android-native-location.sh` — без промени, само sync

**iOS:** не е засегнато — на iOS „Always" опцията се появява в системния prompt по различен начин (Apple позволява втори системен prompt за upgrade) и текущият Capacitor Geolocation я обработва коректно.

---

## Резултат за потребителя

1. Включва Споделяне → вижда обяснителен screen, който предупреждава за двустъпковия процес.
2. OS prompt → избира „Докато използвам".
3. Веднага получава втори, ясен наш диалог: „За пълно споделяне натиснете тук" → бутон отваря системните настройки на app-а на правилния екран.
4. Ако пропусне — вижда постоянен warning banner на главния екран и при следваща location_refresh заявка получава push-style напомняне.
