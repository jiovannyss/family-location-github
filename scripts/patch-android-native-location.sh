#!/usr/bin/env bash
#
# Идемпотентен patcher за native Android locked-screen / killed-app location refresh.
#
# Какво прави:
#   1. Копира android-native/*.kt в android/app/src/main/java/<pkg>/, със заместен package
#   2. Добавя play-services-location и okhttp dependencies в android/app/build.gradle
#   3. Регистрира FamilyLocationMessagingService и LocationRefreshForegroundService
#      в AndroidManifest.xml
#   4. Записва SUPABASE_URL и SUPABASE_ANON_KEY като <meta-data> (от .env)
#
# Безопасно е да се пуска многократно (idempotent). При проблем:
#   rm -rf android/  &&  npx cap sync android  &&  ./scripts/android-prepare.sh

set -euo pipefail

cd "$(dirname "$0")/.."

APP_GRADLE="android/app/build.gradle"
MANIFEST="android/app/src/main/AndroidManifest.xml"
NATIVE_DIR="android-native"

[ -f "$APP_GRADLE" ]  || { echo "❌ $APP_GRADLE липсва (пусни 'npx cap sync android' първо)"; exit 1; }
[ -f "$MANIFEST" ]    || { echo "❌ $MANIFEST липсва"; exit 1; }
[ -d "$NATIVE_DIR" ]  || { echo "❌ $NATIVE_DIR/ не е намерен"; exit 1; }

echo "🔧 Patching native Android location service"

# 1) Намери package + java dir през MainActivity
MAIN_ACTIVITY=$(find android/app/src/main/java -name "MainActivity.java" -o -name "MainActivity.kt" | head -n1 || true)
[ -n "$MAIN_ACTIVITY" ] || { echo "❌ MainActivity не е намерен"; exit 1; }
PKG=$(grep -E '^package ' "$MAIN_ACTIVITY" | head -n1 | sed -E 's/^package[[:space:]]+([^;[:space:]]+).*/\1/')
[ -n "$PKG" ] || { echo "❌ Не успях да extract-на package"; exit 1; }
APP_DIR=$(dirname "$MAIN_ACTIVITY")
echo "  ✅ package=$PKG"
echo "  ✅ app dir=$APP_DIR"

# 2) Копирай Kotlin файловете със заместен package
for f in "$NATIVE_DIR"/*.kt; do
  base=$(basename "$f")
  dst="$APP_DIR/$base"
  sed "s|__PACKAGE__|$PKG|g" "$f" > "$dst"
  echo "  + $base"
done

# 3) Gradle dependencies
add_dep() {
  local dep="$1"
  if ! grep -F "$dep" "$APP_GRADLE" > /dev/null; then
    awk -v d="    implementation '$dep'" '
      /^dependencies[[:space:]]*\{/ && !done { print; print d; done=1; next }
      { print }
    ' "$APP_GRADLE" > "$APP_GRADLE.tmp" && mv "$APP_GRADLE.tmp" "$APP_GRADLE"
    echo "  + dep $dep"
  fi
}
add_dep "com.google.android.gms:play-services-location:21.3.0"
add_dep "com.squareup.okhttp3:okhttp:4.12.0"
add_dep "androidx.core:core-ktx:1.13.1"

# 4) AndroidManifest patches — meta-data + service entries
SUPABASE_URL_VAL="${VITE_SUPABASE_URL:-}"
SUPABASE_ANON_VAL="${VITE_SUPABASE_PUBLISHABLE_KEY:-${VITE_SUPABASE_ANON_KEY:-}}"
if [ -z "$SUPABASE_URL_VAL" ] || [ -z "$SUPABASE_ANON_VAL" ]; then
  if [ -f ".env" ]; then
    [ -z "$SUPABASE_URL_VAL" ] && SUPABASE_URL_VAL=$(grep -E '^VITE_SUPABASE_URL=' .env | head -n1 | cut -d= -f2- | tr -d '"' || true)
    if [ -z "$SUPABASE_ANON_VAL" ]; then
      SUPABASE_ANON_VAL=$(grep -E '^VITE_SUPABASE_PUBLISHABLE_KEY=' .env | head -n1 | cut -d= -f2- | tr -d '"' || true)
      [ -z "$SUPABASE_ANON_VAL" ] && SUPABASE_ANON_VAL=$(grep -E '^VITE_SUPABASE_ANON_KEY=' .env | head -n1 | cut -d= -f2- | tr -d '"' || true)
    fi
  fi
fi
if [ -z "$SUPABASE_URL_VAL" ] || [ -z "$SUPABASE_ANON_VAL" ]; then
  echo "⚠️  Липсват VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — meta-data няма да бъде записано."
  echo "   Native upload ще fail-ва, докато не се конфигурира."
fi

# 4a) Премахни стари наши <meta-data> entries (rewrite-safe)
perl -i -0777 -pe 's|\s*<meta-data android:name="SUPABASE_URL"[^/]*/>||g' "$MANIFEST"
perl -i -0777 -pe 's|\s*<meta-data android:name="SUPABASE_ANON_KEY"[^/]*/>||g' "$MANIFEST"
# 4b) Премахни стари наши <service> entries
perl -i -0777 -pe 's|\s*<service[^>]*android:name="\.FamilyLocationMessagingService".*?</service>||gs' "$MANIFEST"
perl -i -0777 -pe 's|\s*<service[^>]*android:name="\.LocationRefreshForegroundService"[^/]*/>||g' "$MANIFEST"

# 4c) Вмъкни наново преди </application>
INJECT=$(cat <<EOF
        <meta-data android:name="SUPABASE_URL" android:value="${SUPABASE_URL_VAL}" />
        <meta-data android:name="SUPABASE_ANON_KEY" android:value="${SUPABASE_ANON_VAL}" />

        <service
            android:name=".FamilyLocationMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>

        <service
            android:name=".LocationRefreshForegroundService"
            android:foregroundServiceType="location"
            android:exported="false" />
EOF
)
# Escape за perl substitution
INJECT_ESCAPED=$(printf '%s' "$INJECT" | perl -pe 's/([\\\/\$\@\%])/\\$1/g')
perl -i -0777 -pe "s|</application>|${INJECT_ESCAPED}\n    </application>|" "$MANIFEST"

grep -q 'FamilyLocationMessagingService' "$MANIFEST" || { echo "❌ FamilyLocationMessagingService не беше регистриран в manifest"; exit 1; }
grep -q 'LocationRefreshForegroundService' "$MANIFEST" || { echo "❌ LocationRefreshForegroundService не беше регистриран в manifest"; exit 1; }
echo "  ✅ services + meta-data в AndroidManifest.xml"

echo "✅ Native location service patch complete."
echo "   Debug logs: adb logcat -s FamLocNative:V"
