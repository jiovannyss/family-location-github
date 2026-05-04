# iOS Native Readiness Checklist — Семейна Локация

Този документ описва какво е готово в repo-то и какво остава за **ръчна** настройка
в Apple Developer Portal / Xcode след `npx cap add ios && npx cap sync ios`.

---

## 1. Capacitor конфигурация (готово)

Файл: `capacitor.config.ts`

- ✅ `appId: app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`
- ✅ `appName: Семейна локация`
- ✅ `webDir: dist`
- ✅ `server { url }` блокът е **закоментиран** → production билдовете зареждат
  bundle-нат `dist/`, без dev hot-reload URL.
- ✅ `ios.contentInset: 'always'` (правилно за safe-area).
- ✅ `PushNotifications.presentationOptions: ['badge', 'sound', 'alert']`.

> ⚠️ Преди App Store билд винаги проверявай, че `server.url` е коментиран.

---

## 2. Info.plist permission strings

Apple отхвърля приложения без ясни usage descriptions. По-долу са
**копи-пейст** низовете (BG основен език, EN като резервен ключ).

Добавят се ръчно в Xcode → `App/App/Info.plist` (или през target → Info таб):

```xml
<!-- Foreground location -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Семейна локация използва местоположението ви, за да го споделя с членовете на вашите кръгове, докато приложението е отворено.</string>

<!-- Background location (always) — iOS 11+ -->
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>За да виждат близките ви къде сте в реално време (включително когато приложението е затворено), е нужен достъп „Винаги". Можете да го изключите по всяко време от Настройки.</string>

<!-- Legacy ключ (iOS < 11) — Apple препоръчва да присъства -->
<key>NSLocationAlwaysUsageDescription</key>
<string>Споделяне на местоположение с членовете на вашите кръгове, дори когато приложението работи на заден план.</string>

<!-- Push нотификации (текст за Push prompt-а; ключът е незадължителен,
     но е добре за прегледа) -->
<key>NSUserNotificationsUsageDescription</key>
<string>Получавайте съобщения от членовете на кръга си и важни известия за местоположение.</string>
```

### English fallback (по избор — ако подавате локализация на en)

```
NSLocationWhenInUseUsageDescription =
  "Family Location uses your location to share it with members of your circles while the app is open.";

NSLocationAlwaysAndWhenInUseUsageDescription =
  "To let your family see your real-time location (including when the app is closed), please choose \"Always\". You can disable this anytime in Settings.";

NSLocationAlwaysUsageDescription =
  "Share your location with members of your circles, even while the app is in the background.";

NSUserNotificationsUsageDescription =
  "Receive messages from circle members and important location alerts.";
```

> Apple Review tip: формулировките трябва да обясняват **защо** е нужен достъпът,
> а не само **какво** прави приложението. Текстовете по-горе са съобразени.

---

## 3. Xcode → Signing & Capabilities (ръчно)

Отвори `ios/App/App.xcworkspace` → таргет **App** → таб **Signing & Capabilities**.

### 3.1 Signing
- [ ] Team: вашият Apple Developer акаунт
- [ ] Bundle Identifier: `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`
- [ ] Automatically manage signing: ✅

### 3.2 Capabilities (натисни „+ Capability")
- [ ] **Push Notifications**
- [ ] **Background Modes** — отметни:
  - [ ] Location updates
  - [ ] Background fetch
  - [ ] Remote notifications

> След като добавите тези в Xcode, файлът `App.entitlements` ще съдържа:
> - `aps-environment` (development/production — Xcode го управлява)
> - `UIBackgroundModes`: `location`, `fetch`, `remote-notification`

---

## 4. Apple Developer Portal (ръчно)

- [ ] Регистриране на App ID `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`
- [ ] Включи **Push Notifications** capability на App ID
- [ ] Генерирай **APNs Auth Key (.p8)** — използва се по-късно при APNs интеграция
  в `send-push` edge функцията (НЕ е част от текущата стъпка)
- [ ] Създай Provisioning Profile (Xcode automatic signing може да се справи)

> ❗ **Никога** не commit-вай `.p8`, `.p12`, `.mobileprovision`, или signing
> certificates в repo-то. Те се пазят локално или в CI secrets.

---

## 5. App Store изисквания за account creation (проверено в кода)

Apple Guideline 5.1.1(v) изисква in-app account deletion + достъпни Privacy Policy
и Terms за приложения, които позволяват създаване на акаунт.

Текущо състояние в приложението:

| Изискване | Статус | Място |
|---|---|---|
| Изтриване на акаунт | ✅ Готово | `/privacy-data` → бутон „Изтрий акаунт" → edge function `delete-account` |
| Изтриване на история на локациите | ✅ Готово | `/privacy-data` |
| Privacy Policy | ✅ Готово | `/privacy` (`src/pages/Privacy.tsx`) |
| Terms of Service | ✅ Готово | `/terms` (`src/pages/Terms.tsx`) |
| Достъпност от профил/настройки меню | ✅ Готово | Avatar dropdown → „Поверителност и данни", „Документи" |

> Препоръка: при подаване в App Store Review посочи директни линкове към
> `/privacy` и `/terms` от публикувания домейн.

---

## 6. Какво остава за следващите стъпки (НЕ е в текущата задача)

- APNs branch в `supabase/functions/send-push/index.ts` (изисква `.p8` като secret)
- App icons + Launch screen
- App Store Connect metadata, screenshots, privacy nutrition label
- TestFlight setup
