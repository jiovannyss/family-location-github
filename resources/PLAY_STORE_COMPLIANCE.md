# Family Location — Google Play & App Store Compliance Pack

Production-ready compliance package for submitting **Family Location** (Семейна Локация) to Google Play and the Apple App Store. Use this document as the single source of truth when filling out store consoles.

> **Public legal URLs (required by both stores):**
> - Privacy Policy: `https://family-location.lovable.app/privacy`
> - Terms of Service: `https://family-location.lovable.app/terms`
>
> Both pages are mobile-friendly, served over HTTPS, and contain BG + EN content.

---

## 1. Google Play — Data Safety form (exact answers)

### 1.1 Data collection & sharing — overview answers

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS / TLS 1.2+) |
| Do you provide a way for users to request that their data be deleted? | **Yes** (in-app: Settings → Delete account; also via email `privacy@glowter.com`) |
| Has your app been independently validated against a global security standard? | **No** (leave unchecked unless you have a SOC2 / MASA report) |

### 1.2 Data types — what to declare

For each data type below: **Collected = Yes**, **Shared with third parties = No** (Supabase / FCM / APNs are *processors*, not third-party data sharing in Play's sense — confirm in Play's "Data sharing" definitions before submission), **Processed ephemerally = No**, **Required or optional = as noted**, **User can request deletion = Yes**.

| Data type | Category | Purpose(s) | Required / Optional |
|---|---|---|---|
| **Approximate location** | Location | App functionality | Optional (only if sharing is on) |
| **Precise location** | Location | App functionality, **Safety** | Optional (only if sharing is on) |
| **Name** | Personal info | Account management | Required |
| **Email address** | Personal info | Account management | Required |
| **User IDs** | Personal info | Account management, App functionality | Required |
| **Messages — other in-app messages** | Messages | App functionality | Optional |
| **Device or other IDs** | Device or other IDs | App functionality (per-device sharing state) | Required |

> **Do NOT declare:** photos, videos, audio, contacts, calendar, health/fitness, financial info, web history, app activity (analytics), advertising data, installed apps, files/docs. The app does not collect any of these.

### 1.3 Security practices (declare these)

- ✅ Data is encrypted in transit.
- ✅ You can request that data be deleted (in-app + email).
- ✅ Committed to follow the Play Families Policy (only if you target a Families category — otherwise leave unchecked).

---

## 2. Background Location — Google Play declaration

### 2.1 Is access to background location required for core functionality?
**Yes.**

### 2.2 Feature declaration text (paste into Play Console — keep under 500 chars)

> Family Location is a voluntary family-safety app. Background location is a core feature that lets accepted family-circle members continue to see each other's position when the device is locked or the app is minimized — for example on the way home from school or work. Sharing is strictly opt-in, can be stopped with one tap, and is visible only to accepted members of circles the user has joined.

### 2.3 Why foreground-only is not sufficient

> Family safety requires continuity: a user driving home, a child walking from school, or a relative travelling needs their circle to see updates without keeping the app in the foreground. A foreground-only implementation would defeat the core purpose and provide a worse, less reliable safety experience.

### 2.4 Prominent in-app disclosure (already implemented)

Implemented in `src/components/BackgroundLocationRationale.tsx` and shown **before** the OS permission prompt. Covers:
- What is collected (precise location).
- That collection continues in the background.
- Who sees it (accepted circle members only).
- That the user controls it and can stop with one tap.
- That it is not sold or used for ads.

### 2.5 Required demo video — checklist

Record a 30–60s screen recording (Android device, real device preferred) showing in this order:

1. Fresh launch / login screen.
2. Sign in with the demo account.
3. Open the app, navigate to the sharing toggle.
4. Tap **Start sharing** → the in-app **rationale screen** appears.
5. User taps **Continue** → the **OS permission prompt** appears (`While using the app` → upgrade to `Allow all the time`).
6. The persistent **foreground-service notification** appears in the status bar ("Семейна Локация споделя локация").
7. Lock the screen / minimize the app for ~10 seconds.
8. On a second device (or split screen): another circle member sees the location update on the map in real time.
9. Return to the first device, tap **Stop sharing** → the foreground notification disappears.

Upload to YouTube (unlisted) and paste the link in the Play Console declaration.

---

## 3. App Content questionnaires (Google Play)

| Section | Answer |
|---|---|
| Privacy Policy URL | `https://family-location.lovable.app/privacy` |
| Ads | **No, my app does not contain ads** |
| App access | **All or some functionality is restricted** → provide demo credentials (see §5) |
| Content rating | Use the IARC questionnaire. Family Location: no violence, no sexual content, no drugs, location sharing → typically **Everyone / PEGI 3** with a "Users interact" + "Shares location" disclosure. |
| Target audience and content | Target age: **13+**. Not primarily child-directed. |
| News app | **No** |
| COVID-19 contact tracing and status apps | **No** |
| Data safety | See §1 |
| Government apps | **No** |
| Financial features | **No** |
| Health | **No** |

---

## 4. Apple App Store — Privacy & review answers

### 4.1 App Privacy "Nutrition label" (App Store Connect → App Privacy)

For each data type, link to **App Functionality**; do **not** link to Tracking or Third-Party Advertising. None of this data is linked to identity for tracking purposes.

| Data | Linked to user | Used for tracking | Purposes |
|---|---|---|---|
| Precise Location | **Yes** | No | App Functionality |
| Coarse Location | **Yes** | No | App Functionality |
| Name | **Yes** | No | App Functionality |
| Email Address | **Yes** | No | App Functionality |
| User ID | **Yes** | No | App Functionality |
| Other User Content (messages) | **Yes** | No | App Functionality |
| Device ID | **Yes** | No | App Functionality |

### 4.2 Info.plist usage strings (already required in the build)

```
NSLocationWhenInUseUsageDescription = "Family Location shows your position to your family circle while sharing is on."
NSLocationAlwaysAndWhenInUseUsageDescription = "With your permission, Family Location continues to share your position with your family circle when the app is in the background — for safety on the way to and from home, school or work. You can stop sharing at any time."
NSUserNotificationsUsageDescription = "Receive messages and updates from your family circle."
```

### 4.3 Background Modes
- `location` (Location updates) — required for the family-safety feature.
- `remote-notification` — push.

### 4.4 Account deletion
Apple requires apps that support account creation to also support in-app account deletion (Guideline 5.1.1(v)). Implemented at **Settings → Delete account** with a typed-confirmation dialog and recursive server-side wipe via the `delete-account` edge function.

---

## 5. App access / demo account (for reviewers)

Create a dedicated reviewer account before each submission and rotate the password each release.

```
Email:    reviewer@familylocation.demo
Password: <set a fresh strong password per release; do NOT commit>

Pre-seeded:
- 1 circle ("Demo Family") with 2 mock accepted members
- 1 inbound demo message
- Sharing toggle is OFF by default — reviewer can enable it to test
```

### Reviewer notes (paste into Play "App access" / App Store "Notes for the reviewer")

> Family Location is a voluntary, opt-in family location-sharing app.
>
> Demo credentials:
> Email: reviewer@familylocation.demo
> Password: <provided in this submission only>
>
> The demo account is pre-seeded with one family circle and two mock members. To test background location:
> 1. Sign in with the demo account.
> 2. Tap the sharing toggle on the main screen.
> 3. The in-app rationale screen explains background location use; tap Continue.
> 4. Grant the OS permission ("Allow all the time" on Android / "Always" on iOS).
> 5. A persistent foreground-service notification will appear (Android) confirming background tracking. Lock the device and re-open the app — the map updates continue.
> 6. Tap the toggle again to stop sharing — the foreground notification disappears immediately.
>
> Background location is the core feature: it lets accepted family-circle members continue to see each other when the phone is locked or minimized.
> Account deletion is available in-app at: Settings → Изтрий акаунта (Delete account).
> Privacy policy: https://family-location.lovable.app/privacy
> Terms: https://family-location.lovable.app/terms

---

## 6. Settings / UI compliance checklist

- [x] Privacy Policy reachable from Settings (`/privacy`).
- [x] Terms reachable from Settings (`/terms`).
- [x] Privacy Policy & Terms links present on the Auth screen.
- [x] Delete Account in Settings with typed-confirmation safeguard.
- [x] Stop Sharing one-tap on the main screen.
- [x] Pre-permission rationale screen before OS prompt (`BackgroundLocationRationale`).
- [x] Foreground-service notification while background location is active.
- [x] No third-party ads, no analytics SDKs that share data, no advertising IDs.

---

## 7. Rejection-risk register & mitigations

| Risk | Mitigation in app |
|---|---|
| **"Background location not justified"** | Core safety feature; rationale screen + demo video + declaration text in §2. |
| **"Stalkerware concerns"** | Each user creates their own account, accepts invite themselves, and can stop sharing with one tap. Terms §4 explicitly forbid non-consensual tracking. |
| **"Family Safety claims unsupported"** | Marketing copy avoids medical / emergency-response claims. Terms §6 explicitly states do **not** rely on the app for life-threatening situations. |
| **"Privacy policy missing third parties"** | Privacy Policy §4 lists Supabase, FCM, APNs, hosting provider. |
| **"No in-app account deletion"** (Apple 5.1.1(v)) | Implemented in Settings with confirmation. |
| **"Notification permission rationale missing"** | Pre-prompt component `NotificationPermissionPrompt` explains usage before the OS prompt. |
| **"Foreground service type missing"** (Android 14+) | `AndroidManifest.xml` declares `android:foregroundServiceType="location"` + `FOREGROUND_SERVICE_LOCATION` permission (patched by `scripts/patch-android-manifest.sh`). |
| **"Children's safety"** | Privacy §9 and Terms §3 set 13+ minimum, require parental consent below that age, forbid non-consensual tracking. |

---

## 8. Pre-submission checklist (run before every release)

- [ ] Privacy Policy version date matches release date.
- [ ] Terms version date matches release date.
- [ ] Demo account password rotated.
- [ ] Demo video re-recorded if UI changed.
- [ ] `versionCode` / `versionName` bumped.
- [ ] AAB signed with the upload key (see `README.md`).
- [ ] All four GitHub signing secrets set: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- [ ] Internal test track passes the QA checklist in `README.md`.
- [ ] Background location declaration & demo video link attached.
- [ ] Data Safety form re-confirmed (no new data types added).
