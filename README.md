# Семейна Локация (Family Location)

Mobile-first PWA за семейно споделяне на местоположение в реално време. Изграден е web-first с React + Vite, но архитектурата е готова за пакетиране в Android/iOS приложение чрез **Capacitor** без rewrite.

## Tech stack

- **React 18 + Vite 5 + TypeScript**
- **Tailwind CSS** + shadcn/ui (semantic design tokens, HSL колор система)
- **Vanilla Leaflet** за картата (НЕ React-Leaflet)
- **Lovable Cloud** (Supabase) — DB, Auth, Realtime, RLS
- **TanStack Query** за data fetching
- **framer-motion** за анимации
- **sonner** за toast нотификации

## Build & run

```bash
npm install
npm run dev      # development
npm run build    # production build → dist/
npm run preview  # preview built output
```

## Environment variables

Всички environment variables са в `.env` (auto-managed от Lovable Cloud — **не редактирай ръчно**):

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | URL на backend-а |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public anon key (безопасно за client) |
| `VITE_SUPABASE_PROJECT_ID` | Identifier на проекта |

Никакви production URLs или secrets не са hardcoded в кода.

## Архитектура — service layer

Browser-only API-та НЕ се ползват директно в компонентите. Всеки такъв достъп минава през `src/services/*`. Service-ите автоматично избират web или Capacitor (native) имплементация чрез `src/services/platform.ts` (`Capacitor.isNativePlatform()`):

| Service | Web | Native (Capacitor) |
|---|---|---|
| `storage.ts` | `localStorage` | `@capacitor/preferences` |
| `deviceId.ts` | `crypto.randomUUID` + storage | `@capacitor/device` Device.getId() |
| `device.ts` | userAgent sniffing | `@capacitor/device` Device.getInfo() |
| `geolocation.ts` | `navigator.geolocation` | `@capacitor/geolocation` (foreground). Background: добави по-късно `@capacitor-community/background-geolocation` |
| `notifications.ts` | sonner toast + Web Notifications | sonner toast + `@capacitor/local-notifications`. Push: добавя се отделно с FCM/APNs |
| `services/api/*.ts` | Supabase JS client | без промяна (работи в WebView) |

**Правило:** компоненти и хукове викат само service-ите, никога директно `localStorage`, `navigator.geolocation`, `Notification`, и т.н.

## Мобилни приложения (Capacitor) — workflow за rebuild

Уеб версията се деплойва автоматично в SuperHosting при всеки push в `main` (виж `.github/workflows/deploy.yml`). Същият код се пакетира в Android/iOS приложение чрез Capacitor — затова всяка промяна, направена в Lovable, автоматично е готова за следващия мобилен билд.

### Първоначална настройка (еднократно, на твоя Mac/PC)
```bash
git clone <repo>
npm install
npx cap add android      # ако искаш Android
npx cap add ios          # ако искаш iOS (само на Mac с Xcode)
npm run mobile:build     # = vite build && cap sync
```

### Когато решиш да пуснеш нова версия на мобилните приложения
**Вариант A — локално (пълен контрол, нужни са Xcode/Android Studio):**
```bash
git pull
npm install
npm run mobile:build
npm run cap:open:android   # Android Studio → Build → Generate Signed Bundle/APK
npm run cap:open:ios       # Xcode → Product → Archive
```

**Вариант B — автоматичен билд от GitHub (без локална setup):**
1. Иди в GitHub repo → **Actions**
2. Избери **"Build Android (manual)"**
3. Натисни **Run workflow** (от branch `main`)
4. Изчакай ~5-10 мин и свали готовия артефакт:
   - `debug` → `app-debug.apk` (sideload-able за тестване)
   - `release-aab` → `app-release.aab` (за Google Play Internal Testing)

> **Production билдове:**
> - Android `.aab` за Google Play изисква signing keystore (виж секция **Android signing & Internal Testing** по-долу).
> - iOS App Store изисква Apple Developer акаунт + сертификат + provisioning profile.

## Android signing & Internal Testing

### 1. Генерирай keystore (еднократно, локално)

⚠️ Този keystore трябва да се пази **завинаги** — без него не можеш да обновяваш приложението в Play Store.

```bash
keytool -genkey -v \
  -keystore release.keystore \
  -alias family-location \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

Ще те пита за:
- парола за keystore (запиши я),
- парола за key (запиши я; може да е същата),
- име, фирма, държава.

**Backup-ни го веднага** на сигурно място (1Password, HSM, encrypted USB). Никога не го commit-вай в Git.

### 2. Качи го като GitHub Secrets

```bash
# Кодирай keystore-а в base64 (на macOS/Linux):
base64 -i release.keystore | tr -d '\n' | pbcopy   # копира в clipboard
# Или:
base64 -w 0 release.keystore > release.keystore.b64
```

В GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, добави:

| Secret | Стойност |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 на keystore файла |
| `ANDROID_KEYSTORE_PASSWORD` | парола за keystore |
| `ANDROID_KEY_ALIAS` | `family-location` (или каквото си задал) |
| `ANDROID_KEY_PASSWORD` | парола за key |

GitHub Actions автоматично ги маскира в logs. Workflow-ът също ги изтрива от runner-а след билда.

### 3. Билдни signed AAB

GitHub → **Actions → "Build Android (manual)" → Run workflow → build_type: `release-aab`**.

Артефактът `family-location-android-release-aab` съдържа `app-release.aab`.

### 4. Качи в Google Play Internal Testing

1. https://play.google.com/console → Your app → **Testing → Internal testing**
2. **Create new release** (първия път ще те питат да активираш Play App Signing — приеми; Google ще управлява финалния production ключ, твоят keystore остава upload key).
3. **Upload** → drag `app-release.aab`.
4. Release name: напр. `0.1.0-internal-1`. Release notes: кратко описание на промените.
5. **Save → Review release → Start rollout to Internal testing**.
6. В **Testers** добави email-и (или Google Group). Тестерите получават линк (`https://play.google.com/apps/internaltest/...`) → opt-in → инсталация през Play Store.

> **Преди първия Internal Testing build** трябва да попълниш в Play Console:
> - **Privacy Policy URL** → `https://family-location.glowter.com/privacy`
> - **Data safety form** (декларация за collected data — local + push token)
> - **App content** → Target audience, Ads, Permissions declaration (особено `ACCESS_BACKGROUND_LOCATION`)
> - **Content rating** въпросник.

### Hot-reload по време на разработка
Раз-коментирай блока `server` в `capacitor.config.ts` — native приложението ще зарежда live preview-то от Lovable вместо bundled `dist/`. Не оставяй активно за store билдове.

## Capacitor конфигурация

- **App ID:** `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`
- **App name:** `family-location`
- **Web dir:** `dist`
- Конфигурация: `capacitor.config.ts` (root).

## App icons & splash screens

Изходните файлове са в `resources/`:
- `resources/icon.png` — app иконка (1024x1024)
- `resources/splash.png` — splash screen (логото центрирано на бял фон)

За да генерираш всички размери за Android и iOS:
```bash
npx capacitor-assets generate --iconBackgroundColor '#FFFFFF' --splashBackgroundColor '#FFFFFF'
```
Командата автоматично ще попълни `android/app/src/main/res/` и `ios/App/App/Assets.xcassets/`. Вижда се промяната след `npx cap sync`.

За подмяна на иконката: замести `resources/icon.png` (квадратна, ≥1024px) и пусни командата отново.

## Store metadata

Готови текстове за Google Play и App Store (описание, ключови думи, permission strings, screenshot размери) — `resources/STORE_METADATA.md`.

## Push notifications setup (само за native билдове)

Push известията се изпращат през Firebase Cloud Messaging (FCM) — работи и за Android, и за iOS.

### 1. Firebase проект (еднократно)
1. Създай проект на https://console.firebase.google.com
2. Add app → **Android**: package name `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`. Свали `google-services.json` и го сложи в `android/app/`.
3. Add app → **iOS**: bundle ID `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`. Свали `GoogleService-Info.plist` и го добави в `ios/App/App/` през Xcode.
4. За iOS: качи APNs Auth Key (от Apple Developer → Keys) в Firebase → Project Settings → Cloud Messaging.

### 2. Service account за backend-а (еднократно)
1. Firebase Console → Project Settings → Service Accounts → **Generate new private key** → сваля JSON.
2. В Lovable → **Connectors** → Lovable Cloud → Edge Function Secrets, добави secret:
   - Име: `FCM_SERVICE_ACCOUNT_JSON`
   - Стойност: целият JSON като string
3. Edge функцията `send-push` автоматично ще започне да изпраща push-ове. Без този secret тя връща тих 200 (т.е. не блокира нищо).

### 3. Поведение
- При login на native устройство → автоматична регистрация на push token в `push_tokens` таблицата.
- При INSERT на ново съобщение → DB trigger `trg_notify_new_message` извиква `send-push` edge функцията → FCM доставя push към всички устройства на получателя.
- Web версията продължава да работи както преди (toast + Web Notifications когато табът е скрит).

## Database / RLS

- Локацията е видима само за приети членове на общ кръг, които активно споделят.
- Съобщенията са видими само за участниците в разговора и само ако са в общ кръг.
- SECURITY DEFINER функциите предотвратяват infinite recursion в RLS.

## PWA

- `public/manifest.json` с икони и theme color.
- **Без service worker** — за да не конфликтира с Capacitor WebView и Lovable preview.


## Internal Testing — QA checklist

Преди да promote-неш Internal Testing build към Closed/Open Testing, мини през тоя checklist на поне един реален Android телефон (Android 10+ препоръчително, идеално и Android 14):

### Auth
- [ ] **Регистрация** с нов имейл — email confirmation flow работи (или auto-confirm според настройките).
- [ ] **Login** с правилни credentials → отива на `/`.
- [ ] **Login** с грешна парола → показва грешка на български.
- [ ] **Logout** от dropdown menu → връща на `/auth`, не остава кеширан state.
- [ ] **Смяна на акаунт в същата сесия**: logout → login с друг user → проверете че:
  - картата показва кръговете на новия user (не на стария);
  - push токенът на стария user е изтрит от `push_tokens` (проверка през Cloud → Database).

### Account deletion
- [ ] Settings → "Изтрий акаунта" → диалогът показва списък какво ще се изтрие.
- [ ] Бутонът "Изтрий завинаги" е disabled докато не въведеш `ИЗТРИЙ`.
- [ ] След изтриване: redirect към `/auth`, не може да се логнеш със същия имейл (или регистрация работи като нов user).
- [ ] В DB: profile, location_points, push_tokens, sharing_state, owned circles, memberships, messages — всички изтрити.

### Background location
- [ ] При първо включване на споделянето → показва се **rationale screen** (BG+EN) преди OS prompt.
- [ ] Грантване на **"Always"** → споделянето се включва, локацията се появява в `location_points`.
- [ ] **Заключи екрана** → изчакай 2-3 минути → нови точки продължават да пристигат.
- [ ] **Минимизирай app-а** (Home button) → нови точки продължават да пристигат.
- [ ] **Foreground service notification** е видима докато tracking-ът работи.
- [ ] Изключи споделянето от toggle-а → tracking спира, foreground notification изчезва.

### Permission scenarios
- [ ] **Denied location** при OS prompt → toggle показва грешка, споделянето не се включва.
- [ ] **Denied notifications** (Android 13+) → app продължава да работи, но push-овете не пристигат (toast още работи в-app).
- [ ] **Battery saver enabled** → background updates може да се забавят, но не crash-ват.
- [ ] **Doze mode** (телефон неактивен 30+ мин) → updates пристигат при unlock.

### Push notifications
- [ ] От друго устройство, член на същия кръг, изпрати съобщение → получаваш push в lock screen в рамките на ~5 секунди.
- [ ] Tap-ване на push → отваря app-а на правилния екран.
- [ ] App в foreground → съобщението се появява като toast (не двойно).
- [ ] Logout → нови съобщения към стария user **не** пристигат на това устройство.

### Network resilience
- [ ] **Offline** (airplane mode) при включено споделяне → app не crash-ва, грешките са graceful.
- [ ] Връщане online → следващ tick изпраща позиция успешно.
- [ ] **Лош сигнал** (3G / weak Wi-Fi) → няма duplicate точки или infinite loops.

### Lifecycle / install
- [ ] **Uninstall + reinstall** → login работи; стар push token (от предишната инсталация) се replace-ва, не дублира.
- [ ] App update over старата версия → запазен е login; не иска отново permissions ненужно.
- [ ] **Force-stop** от Settings → следващо отваряне зарежда нормално.

### UI / Legal
- [ ] `/privacy` и `/terms` се отварят, BG/EN превключвател работи.
- [ ] Линковете от Auth screen и Settings → Документи водят до правилните страници.
- [ ] Всички текстове на български са грамотни (без AI-изглеждащи фрази).

### Security spot-checks
- [ ] Опит за `curl` към `send-push` без `X-Internal-Secret` → 401.
- [ ] Не-логнат потребител не вижда чужди locations (RLS).
- [ ] Не може да изтриеш чужд акаунт (delete-account проверява JWT subject).

При проблем — отвори issue и **не promote-вай към Closed Testing**.
