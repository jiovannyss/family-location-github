#!/usr/bin/env bash
#
# Идемпотентен patcher за android/app/src/main/AndroidManifest.xml.
# Извиква се ПОСЛЕ `npx cap add android` / `npx cap sync android`, преди
# Gradle build. Безопасно е да се пуска многократно.
#
# Какво прави:
#   1. Добавя permissions нужни за background location и push:
#        - ACCESS_FINE_LOCATION
#        - ACCESS_COARSE_LOCATION
#        - ACCESS_BACKGROUND_LOCATION   (Android 10+)
#        - FOREGROUND_SERVICE
#        - FOREGROUND_SERVICE_LOCATION  (Android 14+)
#        - POST_NOTIFICATIONS           (Android 13+)
#        - WAKE_LOCK
#        - RECEIVE_BOOT_COMPLETED       (за презапускане на background tracker)
#   2. Гарантира usesCleartextTraffic="false" (production hardening).
#   3. Гарантира android:allowBackup="false" (privacy).

set -euo pipefail

MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST" ]; then
  echo "❌ AndroidManifest.xml not found at $MANIFEST. Run 'npx cap add android' first."
  exit 1
fi

echo "🔧 Patching $MANIFEST"

# 1. Permissions
PERMS=(
  "android.permission.ACCESS_FINE_LOCATION"
  "android.permission.ACCESS_COARSE_LOCATION"
  "android.permission.ACCESS_BACKGROUND_LOCATION"
  "android.permission.FOREGROUND_SERVICE"
  "android.permission.FOREGROUND_SERVICE_LOCATION"
  "android.permission.POST_NOTIFICATIONS"
  "android.permission.WAKE_LOCK"
  "android.permission.RECEIVE_BOOT_COMPLETED"
)

for perm in "${PERMS[@]}"; do
  if ! grep -q "$perm" "$MANIFEST"; then
    # Вмъкни преди <application
    sed -i.bak "s|<application|    <uses-permission android:name=\"$perm\" />\n    <application|" "$MANIFEST"
    echo "  + $perm"
  fi
done

# 2. usesCleartextTraffic="false"
if grep -q 'android:usesCleartextTraffic="true"' "$MANIFEST"; then
  sed -i.bak 's|android:usesCleartextTraffic="true"|android:usesCleartextTraffic="false"|' "$MANIFEST"
  echo "  ~ usesCleartextTraffic=false"
fi

# 3. allowBackup="false"
if grep -q 'android:allowBackup="true"' "$MANIFEST"; then
  sed -i.bak 's|android:allowBackup="true"|android:allowBackup="false"|' "$MANIFEST"
  echo "  ~ allowBackup=false"
fi

# 4. App label (под иконата на хоум екрана) → "Семейна локация"
STRINGS="android/app/src/main/res/values/strings.xml"
if [ -f "$STRINGS" ]; then
  # Заменя app_name и title_activity_main стойностите
  sed -i.bak -E 's|(<string name="app_name">)[^<]*(</string>)|\1Семейна локация\2|' "$STRINGS"
  sed -i.bak -E 's|(<string name="title_activity_main">)[^<]*(</string>)|\1Семейна локация\2|' "$STRINGS"
  rm -f "$STRINGS.bak"
  echo "  ~ app_name=Семейна локация"
fi

# Cleanup backup files
rm -f "$MANIFEST.bak"

echo "✅ Manifest patched."
