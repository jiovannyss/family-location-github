## Етап 2: Native Android FirebaseMessagingService за locked-screen / killed-app location refresh

### Цел
Когато телефон Б получи `location_refresh` data-only push при заключен или killed app, native Android код (без JS runtime) да:
1. вземе свежа GPS локация през FusedLocationProvider
2. я качи към `location-refresh-upload` edge function
3. покаже кратка foreground service нотификация (изискване на Android 14+)

JS foreground flow остава недокоснат — продължава да обработва push при отворен app.

---

### Принципи на безопасност (как пазим работещия напредък)

1. **`android/` папката НЕ е в репото** — генерира се от `npx cap add android` + `cap sync`. Ако нещо счупи, `rm -rf android/` връща чисто състояние.
2. **Всички native промени** минават през **идемпотентни patch скриптове**, които се изпълняват СЛЕД `cap sync`.
3. **Native Kotlin изходният код** живее в `android-native/` в репото и се копира в `android/app/src/main/java/...` от patch скрипта.
4. **Не пипаме** token registration, FCM token flow, permission flow, foreground tracking, JS push listener-и, edge functions (`request-location-refresh`, `location-refresh-upload`, `send-push`).
5. **Custom service extends Capacitor's `MessagingService`** — non-`location_refresh` съобщения се delegate-ват чрез `super.onMessageReceived(message)`, така че текущата JS push доставка остава непокътната.

---

### Промени

#### A. Нови native Kotlin файлове (в репото, не в `android/`)

**`android-native/FamilyLocationMessagingService.kt`**
- Extends `com.capacitorjs.plugins.pushnotifications.MessagingService` (Capacitor's FCM service)
- В `onMessageReceived(message)`:
  - Ако `data["type"] == "location_refresh"` → стартира `LocationRefreshForegroundService`, лог `NATIVE location_refresh push received`, `return`
  - Иначе → `super.onMessageReceived(message)` (доставя към JS както винаги)
- В `onNewToken(token)` → `super.onNewToken(token)` (запазва Capacitor flow)

**`android-native/LocationRefreshForegroundService.kt`** (Foreground Service)
- В `onCreate()` → `startForeground(notifId, notification, FOREGROUND_SERVICE_TYPE_LOCATION)` с дискретна notification ("Обновяване на локацията...")
- В `onStartCommand()`:
  - Чете `user_id` и `device_id` от `SharedPreferences` (Capacitor `Preferences` plugin пише в `CapacitorStorage` SharedPreferences)
  - Permission guard: ако няма `ACCESS_FINE_LOCATION` → log `NATIVE ABORT missing permission`, `stopSelf()`
  - `FusedLocationProviderClient.getCurrentLocation(PRIORITY_HIGH_ACCURACY, cancellationToken)` — single shot
  - 30s watchdog timer; ако не пристигне fix → `stopSelf()`
  - При success → OkHttp `POST` към `${SUPABASE_URL}/functions/v1/location-refresh-upload` с `apikey` + `Authorization: Bearer <anon>` headers
  - 15s connect/read timeout
  - Логове: `NATIVE GPS request started`, `NATIVE GPS success/failure`, `NATIVE upload started`, `NATIVE upload success/failure`, `NATIVE service stopped`
  - `stopSelf()` в `finally`
- Tag за всички логове: `FamLocNative` (filter с `adb logcat -s FamLocNative:V`)

#### B. Patch скрипт `scripts/patch-android-native-location.sh`
Идемпотентен. Прави:
1. `cp android-native/*.kt android/app/src/main/java/<package>/`
2. Добавя в `android/app/build.gradle` dependencies (ако липсват):
   - `implementation 'com.google.android.gms:play-services-location:21.3.0'`
   - `implementation 'com.squareup.okhttp3:okhttp:4.12.0'`
3. Добавя в `AndroidManifest.xml` (ако липсват):
   - `<service android:name=".FamilyLocationMessagingService" android:exported="false">` с `<intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT"/></intent-filter>` — **преди** Capacitor's default service entry, така че Android избира нашия
   - `<service android:name=".LocationRefreshForegroundService" android:foregroundServiceType="location" android:exported="false"/>`
4. Записва `SUPABASE_URL` и `SUPABASE_ANON_KEY` като `<meta-data>` в `AndroidManifest.xml`, четат се от Kotlin кода (избягваме hardcode)

#### C. Интеграция
- `scripts/android-prepare.sh`: добавя стъпка `▶ 3/3 Patching native location service` → извиква новия patch script
- `.github/workflows/build-android.yml`: добавя стъпка след "Patch AndroidManifest" (само ако `enable_push == 'true'`):
  ```
  - name: Apply native location service patch
    if: ${{ inputs.enable_push == 'true' }}
    run: ./scripts/patch-android-native-location.sh
  ```

#### D. Малка JS промяна в `src/services/push.ts`
- В `setCachedPushUid` допълнително пише `user_id` и `device_id` в **plain `Preferences`** ключове (`fam_user_id`, `fam_device_id`) с известни имена, така че native Kotlin да ги прочете директно от SharedPreferences (`CapacitorStorage`). 
- JS `handleLocationRefreshPush` остава недокоснат — продължава да работи при foreground.

#### E. Документация
- Нова секция в `README.md`: "Native Android locked-screen location refresh" с обяснение как се debug-ва (`adb logcat -s FamLocNative:V`)

---

### Какво НЕ се пипа
- `src/services/push.ts` `handleLocationRefreshPush`, `attachDeliveryListenersOnce`, `NativePushService.registerForUser`, token upsert
- `src/services/geolocation.ts`, `src/services/locationUpload.ts`, `src/services/backgroundGeo.ts`
- Всички edge functions (`request-location-refresh`, `location-refresh-upload`, `send-push`, `test-push`)
- Firebase setup, `patch-android-firebase.sh`, `MyApplication.java`
- iOS workflow и iOS код
- Permission flow (Android background-location onboarding е отделен patch)

---

### Технически детайли

**Защо extend Capacitor's MessagingService, а не replace?**
Capacitor's `@capacitor/push-notifications` plugin регистрира свой `MessagingService` за да доставя push-и към JS. Ако го заменим напълно, foreground push доставка към JS ще се счупи. Затова extend-ваме и delegate-ваме чрез `super.onMessageReceived()` за всичко, което не е `location_refresh`.

**Защо четем user_id/device_id от SharedPreferences, не от Supabase auth?**
В native Kotlin няма Supabase SDK. Auth токенът е в Capacitor `Preferences`, но е JWT — би трябвало да го refresh-ваме. Затова използваме съществуващия `location-refresh-upload` endpoint, който приема `(userId, deviceId)` и валидира срещу `push_tokens` (вече registered device). Това е същият auth модел като JS пътя.

**Защо `FOREGROUND_SERVICE_TYPE_LOCATION`?**
Android 14+ изисква типизиран foreground service за достъп до location в background. Permission `FOREGROUND_SERVICE_LOCATION` вече е в manifest-а.

**Notification UX**
Кратка нотификация "Обновяване на локацията..." с low importance (`IMPORTANCE_LOW` channel) — не звъни, не вибрира, изчезва щом service-ът stop-не. Изисквание на Android, не може да се избегне за foreground service.

---

### План за rollback (ако нещо счупи)
1. Премахни стъпката от `build-android.yml` и `android-prepare.sh`
2. `rm -rf android/` локално → `npx cap sync android` → `./scripts/android-prepare.sh`
3. Резултат: текущият работещ JS foreground flow (без native) се връща напълно

### Ред на изпълнение
1. Създаване на `android-native/FamilyLocationMessagingService.kt` и `LocationRefreshForegroundService.kt`
2. Създаване на `scripts/patch-android-native-location.sh`
3. Интеграция в `scripts/android-prepare.sh` и `.github/workflows/build-android.yml`
4. Малък JS patch в `push.ts` за `fam_user_id`/`fam_device_id` SharedPreferences ключове
5. Документация в `README.md`
