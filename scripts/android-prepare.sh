#!/usr/bin/env bash
#
# Локална подготовка на Android проекта за билд от Android Studio.
# Извикай след `npx cap sync android` чрез:
#
#   npm run android:prepare
#
# Прави:
#   1. patch-android-manifest.sh — permissions, hardening, app label
#   2. patch-android-firebase.sh — google-services + MyApplication
#   3. сanity report — къде се намират ключови файлове
#
# Спира с ясно съобщение, ако нещо липсва.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d "android" ]; then
  echo "❌ Папка android/ не съществува. Пусни първо:"
  echo "   npm run build && npx cap add android && npx cap sync android"
  exit 1
fi

echo "▶ 1/2  Patching AndroidManifest.xml"
chmod +x scripts/patch-android-manifest.sh
./scripts/patch-android-manifest.sh

echo ""
echo "▶ 2/2  Patching Firebase / google-services"
chmod +x scripts/patch-android-firebase.sh
./scripts/patch-android-firebase.sh

echo ""
echo "🎉 Android проектът е готов за билд."
echo "   Следващи стъпки:"
echo "     npx cap open android        # отваря Android Studio"
echo "     или: cd android && ./gradlew assembleDebug"
