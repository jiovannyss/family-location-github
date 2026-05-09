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

# 2) Изчисти стари .kt файлове (миграция към Java)
for stale in FamilyLocationMessagingService.kt LocationRefreshForegroundService.kt; do
  if [ -f "$APP_DIR/$stale" ]; then
    rm -f "$APP_DIR/$stale"
    echo "  - removed stale $stale"
  fi
done

# 2b) Копирай Java файловете със заместен package
shopt -s nullglob
for f in "$NATIVE_DIR"/*.java; do
  base=$(basename "$f")
  dst="$APP_DIR/$base"
  sed "s|__PACKAGE__|$PKG|g" "$f" > "$dst"
  echo "  + $base"
done

# 2c) Регистрирай BgLocationBridge plugin в MainActivity
if ! grep -q "BgLocationBridge.class" "$MAIN_ACTIVITY"; then
  if grep -q "super.onCreate(" "$MAIN_ACTIVITY"; then
    perl -i -0777 -pe "s|(super\.onCreate\([^)]*\);)|registerPlugin(${PKG}.BgLocationBridge.class);\n        \$1|" "$MAIN_ACTIVITY"
    echo "  ✅ MainActivity: registerPlugin(BgLocationBridge.class)"
  else
    echo "  ⚠️  MainActivity без super.onCreate — не успях да вмъкна registerPlugin"
  fi
fi

# 3) Gradle dependencies (само play-services-location; HTTP е HttpURLConnection)
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

# 4a) Гарантирай xmlns:tools на <manifest> (нужно за tools:node="remove")
if ! grep -q 'xmlns:tools=' "$MANIFEST"; then
  perl -i -0777 -pe 's|<manifest(\s+xmlns:android="[^"]+")|<manifest$1 xmlns:tools="http://schemas.android.com/tools"|' "$MANIFEST"
  echo "  + xmlns:tools на <manifest>"
fi

# 4b) Премахни стари наши <meta-data> и <service> entries (idempotent rewrite)
perl -i -0777 -pe 's|\s*<meta-data android:name="SUPABASE_URL"[^/]*/>||g' "$MANIFEST"
perl -i -0777 -pe 's|\s*<meta-data android:name="SUPABASE_ANON_KEY"[^/]*/>||g' "$MANIFEST"
perl -i -0777 -pe 's|\s*<service[^>]*android:name="\.FamilyLocationMessagingService".*?</service>||gs' "$MANIFEST"
perl -i -0777 -pe 's|\s*<service[^>]*android:name="\.LocationRefreshForegroundService"[^/]*/>||g' "$MANIFEST"
perl -i -0777 -pe 's|\s*<service[^>]*android:name="com\.capacitorjs\.plugins\.pushnotifications\.MessagingService"[^/]*/>||g' "$MANIFEST"

# 4c) Вмъкни наново преди </application>
INJECT=$(cat <<EOF
        <meta-data android:name="SUPABASE_URL" android:value="${SUPABASE_URL_VAL}" />
        <meta-data android:name="SUPABASE_ANON_KEY" android:value="${SUPABASE_ANON_VAL}" />

        <!-- Disable Capacitor's default MessagingService (нашият extends го и поема всичко) -->
        <service
            android:name="com.capacitorjs.plugins.pushnotifications.MessagingService"
            tools:node="remove" />

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
INJECT_ESCAPED=$(printf '%s' "$INJECT" | perl -pe 's/([\\\/\$\@\%])/\\$1/g')
perl -i -0777 -pe "s|</application>|${INJECT_ESCAPED}\n    </application>|" "$MANIFEST"

# 5) Hard verify — fail с ясно съобщение ако нещо липсва
echo ""
echo "🔎 Verify Stage 2 integration"
ERR=0
check_manifest() {
  local needle="$1" label="$2"
  if ! grep -qF "$needle" "$MANIFEST"; then
    echo "  ❌ manifest липсва: $label"
    ERR=1
  fi
}
check_gradle() {
  local needle="$1"
  if ! grep -qF "$needle" "$APP_GRADLE"; then
    echo "  ❌ gradle dependency липсва: $needle"
    ERR=1
  fi
}
check_file() {
  if [ ! -f "$1" ]; then
    echo "  ❌ native файл липсва: $1"
    ERR=1
  fi
}

check_file "$APP_DIR/FamilyLocationMessagingService.java"
check_file "$APP_DIR/LocationRefreshForegroundService.java"
if [ -f "$APP_DIR/FamilyLocationMessagingService.kt" ] || [ -f "$APP_DIR/LocationRefreshForegroundService.kt" ]; then
  echo "  ❌ старите .kt файлове трябва да се изтрият (мигрирано към Java)"
  ERR=1
fi

check_manifest "xmlns:tools"                        "xmlns:tools на <manifest>"
check_manifest ".FamilyLocationMessagingService"    "service .FamilyLocationMessagingService"
check_manifest ".LocationRefreshForegroundService"  "service .LocationRefreshForegroundService"
check_manifest 'tools:node="remove"'                "Capacitor MessagingService override"
check_manifest "com.google.firebase.MESSAGING_EVENT" "intent-filter MESSAGING_EVENT"
check_manifest "SUPABASE_URL"                       "meta-data SUPABASE_URL"
check_manifest "SUPABASE_ANON_KEY"                  "meta-data SUPABASE_ANON_KEY"

for p in \
  "android.permission.ACCESS_FINE_LOCATION" \
  "android.permission.ACCESS_BACKGROUND_LOCATION" \
  "android.permission.FOREGROUND_SERVICE" \
  "android.permission.FOREGROUND_SERVICE_LOCATION" \
  "android.permission.POST_NOTIFICATIONS"; do
  check_manifest "$p" "permission $p"
done

check_gradle "play-services-location"
check_gradle "firebase-messaging"

if [ "$ERR" = "1" ]; then
  echo ""
  echo "❌ Stage 2 verify FAILED — поправи pipeline-а преди build."
  exit 1
fi
echo "✅ Stage 2 verify OK — native services, deps и permissions са на място."

echo ""
echo "✅ Native location service patch complete."
echo "   Debug logs: adb logcat -s FamLocNative:V"
