#!/usr/bin/env bash
#
# Идемпотентен patcher, който apply-ва Google Services Gradle plugin-а към
# Android проекта. Без този plugin `google-services.json` НЕ се обработва от
# build системата — Firebase init гърми на native ниво при първото
# `PushNotifications.register()` повикване и Android процесът се killva
# (особено агресивно на Xiaomi/MIUI).
#
# Извиква се ПОСЛЕ `npx cap sync android` и ПРЕДИ Gradle build.
# Безопасно е да се пуска многократно.
#
# Какво прави:
#   1. Добавя `classpath 'com.google.gms:google-services:4.4.2'` в
#      project-level android/build.gradle.
#   2. Добавя `apply plugin: 'com.google.gms.google-services'` най-долу в
#      android/app/build.gradle.
#   3. Verify-ва, че android/app/google-services.json съществува (ако не,
#      само предупреждава — push може да е disabled нарочно).

set -euo pipefail

PROJECT_GRADLE="android/build.gradle"
APP_GRADLE="android/app/build.gradle"
GS_JSON="android/app/google-services.json"

if [ ! -f "$PROJECT_GRADLE" ] || [ ! -f "$APP_GRADLE" ]; then
  echo "❌ Android Gradle files not found. Run 'npx cap add android' / 'npx cap sync android' first."
  exit 1
fi

echo "🔧 Patching Firebase / google-services Gradle config"

# 1. Project-level classpath
if ! grep -q "com.google.gms:google-services" "$PROJECT_GRADLE"; then
  # Вмъкни classpath реда вътре в dependencies { ... } блока на buildscript.
  # Търсим първия `classpath ` ред и добавяме нашия след него.
  if grep -q "classpath " "$PROJECT_GRADLE"; then
    awk '
      /classpath / && !done {
        print
        print "        classpath '\''com.google.gms:google-services:4.4.2'\''"
        done=1
        next
      }
      { print }
    ' "$PROJECT_GRADLE" > "$PROJECT_GRADLE.tmp" && mv "$PROJECT_GRADLE.tmp" "$PROJECT_GRADLE"
    echo "  + classpath com.google.gms:google-services:4.4.2"
  else
    echo "  ⚠️  Не намерих съществуващ 'classpath ' ред в $PROJECT_GRADLE — пропускам."
  fi
else
  echo "  = classpath com.google.gms:google-services вече присъства"
fi

# 2. App-level apply plugin (най-долу)
if ! grep -q "com.google.gms.google-services" "$APP_GRADLE"; then
  printf "\napply plugin: 'com.google.gms.google-services'\n" >> "$APP_GRADLE"
  echo "  + apply plugin: com.google.gms.google-services"
else
  echo "  = apply plugin: com.google.gms.google-services вече присъства"
fi

# 3. google-services.json sanity check
if [ ! -s "$GS_JSON" ]; then
  echo "  ⚠️  $GS_JSON липсва или е празен."
  echo "      Push нотификациите няма да работят, но build-ът ще гръмне ако"
  echo "      google-services plugin-а е apply-нат без JSON. Прекъсвам."
  exit 1
else
  echo "  ✅ google-services.json присъства ($(wc -c < "$GS_JSON") bytes)"
fi

echo "✅ Firebase Gradle config patched."
