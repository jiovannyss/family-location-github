# iOS CI Setup — билд от GitHub Actions без Mac

Това ръководство показва как да подготвиш всички Apple credentials и GitHub
Secrets, нужни за `.github/workflows/build-ios.yml` (signed archive → `.ipa` →
TestFlight). **Не ти трябва Mac** — всички стъпки са през Apple Developer
уебсайта и App Store Connect.

> ⚠️ Никой от тези файлове / ключове не трябва да попада в git repo-то.

---

## Преди да започнеш

Трябва ти:
- Платен **Apple Developer Program** акаунт ($99/год)
- Достъп до [developer.apple.com](https://developer.apple.com) и
  [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
- Bundle ID: `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`

---

## 1. Apple Developer Portal — App ID

1. Иди на [Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. **+** → App IDs → App
3. Description: `Family Location`
4. Bundle ID: **Explicit** = `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`
5. Capabilities: отметни **Push Notifications** (за бъдещо ползване)
6. Continue → Register

---

## 2. Distribution Certificate (.p12)

Понеже нямаш Mac, използваме **CSR от уебсайта на Apple** няма как — Apple
изисква CSR от Keychain. Има 2 опции:

### Опция A (препоръчителна): Apple App Store Connect API key MAGIC

Не — distribution certificate **не може** да се генерира без CSR. Затова
използвай един от двата подхода:

#### A1. OpenSSL CSR (работи на Linux/Windows/WSL)

```bash
# 1. Генерирай private key + CSR (на който и да е компютър с openssl)
openssl genrsa -out ios_distribution.key 2048
openssl req -new -key ios_distribution.key -out ios_distribution.csr \
  -subj "/emailAddress=ТВОЯ_EMAIL/CN=Family Location Distribution/C=BG"
```

2. Иди на [Certificates](https://developer.apple.com/account/resources/certificates/list)
3. **+** → **Apple Distribution** → Continue
4. Upload `ios_distribution.csr` → Continue → **Download** → получаваш `distribution.cer`

5. Конвертирай в `.p12` (трябва ти и `.cer` от Apple, и твоят private `.key`):

```bash
# Конвертирай .cer (DER) в .pem
openssl x509 -in distribution.cer -inform DER -out distribution.pem -outform PEM

# Сглоби .p12 (ще те пита за export password — ЗАПАЗИ Я, тя ще е IOS_DIST_CERTIFICATE_PASSWORD)
openssl pkcs12 -export \
  -inkey ios_distribution.key \
  -in distribution.pem \
  -out ios_distribution.p12 \
  -name "Apple Distribution"
```

> Пази `ios_distribution.key` и `.p12` сигурно (password manager). Без `.key`
> няма как да генерираш нов `.p12` от същия certificate.

#### A2. Чужд Mac за 5 минути

Алтернатива: помоли някой с Mac да отвори Keychain Access → Certificate
Assistant → Request a Certificate from a Certificate Authority → запиши на
диск → upload-ни CSR-а в Apple Developer → след получаване на `.cer`,
double-click в Keychain → десен клик → Export as `.p12` с парола.

---

## 3. Provisioning Profile (.mobileprovision)

1. Иди на [Profiles](https://developer.apple.com/account/resources/profiles/list)
2. **+** → **App Store** (под Distribution) → Continue
3. App ID: избери `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`
4. Certificate: избери **Apple Distribution** certificate-а от стъпка 2
5. Provisioning Profile Name: `Family Location AppStore`
6. Generate → **Download** → получаваш `Family_Location_AppStore.mobileprovision`

---

## 4. App Store Connect API Key (.p8)

Това е ключът, с който CI-ят се аутентикира за upload към TestFlight.

1. Иди на [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api)
2. **Generate API Key** (или **+** ако вече имаш)
3. Name: `GitHub Actions CI`
4. Access: **App Manager** (минимум; Admin също работи)
5. Generate → **Download API Key** → получаваш `AuthKey_XXXXXXXXXX.p8`
   (можеш да го свалиш САМО ВЕДНЪЖ — пази го сигурно)
6. Запиши си:
   - **Key ID** (10 знака, виждаш го в таблицата) → `APP_STORE_CONNECT_API_KEY_ID`
   - **Issuer ID** (UUID най-горе на страницата) → `APP_STORE_CONNECT_API_ISSUER_ID`

---

## 5. Apple Team ID

1. Иди на [Membership Details](https://developer.apple.com/account#MembershipDetailsCard)
2. Копирай **Team ID** (10 знака, например `A1B2C3D4E5`) → `IOS_TEAM_ID`

---

## 6. Създай app записа в App Store Connect

Преди първия TestFlight upload, App-ът трябва да съществува в ASC:

1. [App Store Connect → Apps](https://appstoreconnect.apple.com/apps) → **+** → New App
2. Platform: iOS
3. Name: `Семейна Локация` (или каквото искаш да се вижда в App Store)
4. Primary Language: Bulgarian
5. Bundle ID: избери `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76`
6. SKU: произволен уникален низ (напр. `family-location-bg`)
7. User Access: Full Access
8. Create

> Не е нужно да попълваш store metadata / screenshots сега — само за TestFlight
> upload.

---

## 7. Кодирай файловете в base64

GitHub Secrets приемат текст, затова `.p12`, `.mobileprovision` и `.p8` се
качват base64-кодирани.

**macOS / Linux:**
```bash
base64 -i ios_distribution.p12 | pbcopy            # macOS
base64 -w0 ios_distribution.p12                    # Linux
base64 -w0 Family_Location_AppStore.mobileprovision
base64 -w0 AuthKey_XXXXXXXXXX.p8
```

**Windows (PowerShell):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ios_distribution.p12")) | Set-Clipboard
```

---

## 8. Добави GitHub Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.

Добави следните 9 secret-а:

| Secret | Стойност |
|---|---|
| `IOS_DIST_CERTIFICATE_P12_BASE64` | base64 на `ios_distribution.p12` |
| `IOS_DIST_CERTIFICATE_PASSWORD` | паролата, с която експортна `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | base64 на `.mobileprovision` |
| `IOS_KEYCHAIN_PASSWORD` | произволен низ (използва се за temp keychain в runner-а; напр. `openssl rand -base64 24`) |
| `APP_STORE_CONNECT_API_KEY_P8_BASE64` | base64 на `AuthKey_XXXXXXXXXX.p8` |
| `APP_STORE_CONNECT_API_KEY_ID` | 10-знаковият Key ID |
| `APP_STORE_CONNECT_API_ISSUER_ID` | UUID-то на Issuer |
| `IOS_TEAM_ID` | 10-знаковият Apple Team ID |
| `IOS_BUNDLE_ID` | `app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76` |

---

## 9. Стартирай билда

GitHub repo → **Actions → Build iOS (manual) → Run workflow**.

- **`build_type: validate`** — прави signed archive + `.ipa`, validate-ва
  срещу App Store API, качва `.ipa` като GitHub artifact. **Не upload-ва.**
  Използвай това за първи тест, че всичко е настроено.
- **`build_type: testflight`** — същото + upload към TestFlight. След няколко
  минути билдът се появява в [TestFlight таба](https://appstoreconnect.apple.com/apps)
  на app-а ти (първоначално в "Processing", после "Ready to Test").

> Първият upload минава през Apple "Export Compliance" въпроси — отговори ги
> в App Store Connect преди да можеш да поканиш тестъри.

---

## 10. Чести грешки

| Симптом | Причина | Fix |
|---|---|---|
| `No signing certificate "iOS Distribution" found` | `.p12` не е импортнат правилно | Провери `IOS_DIST_CERTIFICATE_PASSWORD`; пре-export-ни `.p12` |
| `No profiles for 'app.lovable...' were found` | Bundle ID в profile ≠ Bundle ID в проекта | Регенерирай profile с правилния App ID |
| `errSecInternalComponent` при codesign | Keychain не е unlock-нат | Workflow-ът прави това; провери че `IOS_KEYCHAIN_PASSWORD` е set |
| `Authentication credentials are missing` (altool) | Грешен Key ID / Issuer ID или `.p8` | Свери ги от ASC → Integrations |
| `Invalid Provisioning Profile Signature` | Profile е експирал или certificate-ът е revoked | Регенерирай и двете |
| TestFlight upload минава, но билдът не се появява | Все още е в Processing (5–30 мин) | Изчакай; провери email за ASC съобщения |

---

## 11. Какво НЕ е включено (нарочно)

- **APNs интеграция** в `send-push` edge функцията — отделна стъпка, ще
  ползва същия `.p8` ключ (или отделен APNs `.p8`).
- **Store metadata, screenshots, privacy nutrition label** — попълват се
  ръчно в App Store Connect преди публичен release.
- **Launch screen / app icons** — иконките се генерират от `resources/`
  при `cap sync` (както при Android).
