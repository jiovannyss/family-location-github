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
2. Избери **"Build Android (manual)"** или **"Build iOS (manual)"**
3. Натисни **Run workflow** (от branch `main`)
4. Изчакай ~5-10 мин и свали готовия артефакт (`.apk` за Android, `.app` за iOS симулатор)

> **Production билдове:**
> - Android `.aab` за Google Play изисква signing keystore (качи го като GitHub Secret и допълни workflow-а).
> - iOS App Store изисква Apple Developer акаунт + сертификат + provisioning profile.

### Hot-reload по време на разработка
Раз-коментирай блока `server` в `capacitor.config.ts` — native приложението ще зарежда live preview-то от Lovable вместо bundled `dist/`. Не оставяй активно за store билдове.

## Capacitor конфигурация

- **App ID:** `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`
- **App name:** `family-location`
- **Web dir:** `dist`
- Конфигурация: `capacitor.config.ts` (root).

## Database / RLS

- Локацията е видима само за приети членове на общ кръг, които активно споделят.
- Съобщенията са видими само за участниците в разговора и само ако са в общ кръг.
- SECURITY DEFINER функциите предотвратяват infinite recursion в RLS.

## PWA

- `public/manifest.json` с икони и theme color.
- **Без service worker** — за да не конфликтира с Capacitor WebView и Lovable preview.

