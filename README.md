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

Browser-only API-та НЕ се ползват директно в компонентите. Всеки такъв достъп минава през `src/services/*`, за да може лесно да се замени с Capacitor plugin:

| Service | Web implementation | Capacitor replacement |
|---|---|---|
| `src/services/storage.ts` | `localStorage` | `@capacitor/preferences` |
| `src/services/deviceId.ts` | crypto.randomUUID + storage | `@capacitor/device` Device.getId() |
| `src/services/device.ts` | userAgent sniffing | `@capacitor/device` Device.getInfo() |
| `src/services/geolocation.ts` | `navigator.geolocation` (foreground) | `@capacitor/geolocation` + `@capacitor-community/background-geolocation` за background tracking |
| `src/services/notifications.ts` | sonner toast + Web Notifications | `@capacitor/push-notifications` + `@capacitor/local-notifications` + Firebase Cloud Messaging |
| `src/services/api/*.ts` | Supabase JS client | без промяна (Supabase работи в WebView) |

**Правило:** компоненти и хукове викат само service-ите, никога директно `localStorage`, `navigator.geolocation`, `Notification`, `window.location` и т.н.

## Capacitor readiness notes

Когато решиш да направиш native build:

1. `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
2. `npx cap init` с:
   - **App ID:** `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`
   - **App name:** `family-location`
3. `npx cap add ios` и/или `npx cap add android`
4. `npm run build && npx cap sync`
5. `npx cap run ios` / `npx cap run android`

**Какво вече е готово:**
- ✅ Service layer за geolocation, notifications, storage, device
- ✅ `BrowserRouter` с SPA fallback (работи в WebView)
- ✅ Mobile-first responsive UI (lg breakpoint)
- ✅ Safe-area CSS (`env(safe-area-inset-*)`) за notch/status bar
- ✅ `viewport-fit=cover`
- ✅ `touch-action: manipulation` срещу double-tap zoom
- ✅ Manifest без service worker (за да не пречи на Capacitor)
- ✅ Persistent device id за multi-device sharing
- ✅ Централизиран API layer в `src/services/api/`
- ✅ Без hardcoded URLs/secrets

**Какво ще трябва да смениш при native:**
- `src/services/geolocation.ts` → използвай `@capacitor/geolocation`. За background tracking добави `@capacitor-community/background-geolocation` и викай `sendPos` от неговия callback. Backend (`location_points` таблицата) и UI няма нужда от промяна.
- `src/services/notifications.ts` → добави Push Notifications listener-и; backend hook за изпращане на push при `INSERT` в `messages` таблицата (Supabase Edge Function + FCM).
- `src/services/storage.ts` → `@capacitor/preferences` (запази същия ключ `family_location_device_id` за миграция).
- `src/services/device.ts` → `Device.getInfo().platform` връща native стойност.

## Browser-specific участъци

Всички такива места са изолирани в `src/services/*` и са маркирани с коментар. Ако намериш `localStorage`/`navigator.geolocation`/`Notification` извън `src/services/`, това е bug.

## Database / RLS

- Локацията е видима само за приети членове на общ кръг, които активно споделят (виж RLS policies на `location_points` и `sharing_state`).
- Съобщенията са видими само за участниците в разговора, и само ако и двамата са приети членове на същия кръг.
- SECURITY DEFINER функциите (`is_circle_member`, `is_accepted_circle_mate`) предотвратяват infinite recursion в RLS.

## PWA

- `public/manifest.json` с икони и theme color.
- **Без service worker** — съзнателно решение, за да не конфликтира с Capacitor WebView и Lovable preview-то.
- App-ът може да се добави към Home Screen на iOS/Android през браузъра.
