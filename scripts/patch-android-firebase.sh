#!/usr/bin/env bash
#
# Идемпотентен patcher за Android Firebase инициализация.
# Работи и в CI, и локално (извикан от `npm run android:prepare`).
#
# Поправя crash:
#   "Default FirebaseApp is not initialized in this process"
# при PushNotifications.register().
#
# Какво прави (всяка стъпка с verify, fail при несъответствие):
#   1. Проверява android/app/google-services.json
#   2. classpath 'com.google.gms:google-services:4.4.2' в android/build.gradle
#   3. apply plugin: 'com.google.gms.google-services' в android/app/build.gradle
#   4. firebase-bom + firebase-messaging dependencies
#   5. Създава MyApplication.java (с правилния package), който в onCreate()
#      извиква FirebaseApp.initializeApp(this) — гарантирано преди MainActivity.
#   6. Добавя android:name=".MyApplication" в AndroidManifest <application>
#   7. Запазва FirebaseApp.initializeApp(this) и в MainActivity като защитна
#      мрежа (idempotent — no-op при втори call).

set -euo pipefail

PROJECT_GRADLE="android/build.gradle"
APP_GRADLE="android/app/build.gradle"
GS_JSON="android/app/google-services.json"
MANIFEST="android/app/src/main/AndroidManifest.xml"

fail() { echo "❌ $1"; exit 1; }

[ -f "$PROJECT_GRADLE" ] || fail "$PROJECT_GRADLE липсва. Пусни 'npx cap add android' / 'npx cap sync android' първо."
[ -f "$APP_GRADLE" ]     || fail "$APP_GRADLE липсва."
[ -f "$MANIFEST" ]       || fail "$MANIFEST липсва."

echo "🔧 Patching Android Firebase config"

# 1. google-services.json
[ -s "$GS_JSON" ] || fail "$GS_JSON липсва или е празен. За локален build:
   - Свали google-services.json от Firebase Console
   - Сложи го на път: $GS_JSON
   - Пусни отново: npm run android:prepare"
echo "  ✅ google-services.json присъства ($(wc -c < "$GS_JSON") bytes)"

# 2. Project-level classpath
if ! grep -q "com.google.gms:google-services" "$PROJECT_GRADLE"; then
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
  else
    fail "Не намерих 'classpath ' ред в $PROJECT_GRADLE — нестандартна структура."
  fi
fi
grep -q "com.google.gms:google-services" "$PROJECT_GRADLE" \
  || fail "classpath google-services не беше добавен в $PROJECT_GRADLE."
echo "  ✅ classpath com.google.gms:google-services:4.4.2"

# 3. App-level apply plugin (директен apply най-долу)
if ! grep -q "com.google.gms.google-services" "$APP_GRADLE"; then
  printf "\napply plugin: 'com.google.gms.google-services'\n" >> "$APP_GRADLE"
fi
grep -q "com.google.gms.google-services" "$APP_GRADLE" \
  || fail "apply plugin google-services не беше добавен в $APP_GRADLE."
echo "  ✅ apply plugin: com.google.gms.google-services"

# 4. Firebase BOM + messaging
if ! grep -q "firebase-bom" "$APP_GRADLE"; then
  awk '
    /^dependencies[[:space:]]*\{/ && !done {
      print
      print "    implementation platform('\''com.google.firebase:firebase-bom:33.7.0'\'')"
      print "    implementation '\''com.google.firebase:firebase-messaging'\''"
      done=1
      next
    }
    { print }
  ' "$APP_GRADLE" > "$APP_GRADLE.tmp" && mv "$APP_GRADLE.tmp" "$APP_GRADLE"
fi
grep -q "firebase-bom" "$APP_GRADLE" \
  || fail "firebase-bom dependency не беше добавен в $APP_GRADLE."
grep -q "firebase-messaging" "$APP_GRADLE" \
  || fail "firebase-messaging dependency не беше добавен в $APP_GRADLE."
echo "  ✅ firebase-bom:33.7.0 + firebase-messaging"

# 5. MyApplication.java — извличаме package от MainActivity
MAIN_ACTIVITY=$(find android/app/src/main/java -name "MainActivity.java" | head -n1 || true)
[ -n "$MAIN_ACTIVITY" ] && [ -f "$MAIN_ACTIVITY" ] \
  || fail "MainActivity.java не намерен в android/app/src/main/java/."

PKG=$(grep -E '^package ' "$MAIN_ACTIVITY" | head -n1 | sed -E 's/^package[[:space:]]+([^;]+);.*/\1/')
[ -n "$PKG" ] || fail "Не успях да extract-на package от $MAIN_ACTIVITY."

APP_DIR=$(dirname "$MAIN_ACTIVITY")
MY_APP="$APP_DIR/MyApplication.java"

cat > "$MY_APP" <<EOF
package $PKG;

import android.app.Application;
import android.util.Log;
import com.google.firebase.FirebaseApp;

/**
 * Custom Application клас — гарантира, че FirebaseApp.initializeApp(this) е
 * извикан ПРЕДИ MainActivity, services и Capacitor plugins.
 *
 * Без това PushNotifications.register() crash-ва с
 * "Default FirebaseApp is not initialized in this process".
 *
 * Auto-генериран от scripts/patch-android-firebase.sh.
 */
public class MyApplication extends Application {
    private static final String TAG = "MyApplication";

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            FirebaseApp.initializeApp(this);
            Log.i(TAG, "FirebaseApp.initializeApp(this) OK");
        } catch (Throwable t) {
            Log.e(TAG, "FirebaseApp.initializeApp failed", t);
        }
    }
}
EOF
[ -f "$MY_APP" ] || fail "MyApplication.java не беше създаден."
echo "  ✅ MyApplication.java ($PKG)"

# 6. android:name=".MyApplication" в AndroidManifest <application>
if grep -q 'android:name=".MyApplication"' "$MANIFEST"; then
  echo "  = android:name=\".MyApplication\" вече в AndroidManifest"
elif grep -qE '<application[^>]*android:name=' "$MANIFEST"; then
  fail "<application> вече има друг android:name. Премахни го ръчно или поправи скрипта."
else
  # Вмъкни android:name=".MyApplication" в <application ...> tag.
  # Capacitor генерира <application последвано от newline, не space —
  # затова ползваме perl в slurp mode за да match-нем през редове.
  perl -i -0777 -pe 's|<application(\s)|<application android:name=".MyApplication"$1|' "$MANIFEST"
fi
grep -q 'android:name=".MyApplication"' "$MANIFEST" \
  || fail "android:name=\".MyApplication\" не беше добавен в AndroidManifest."
echo "  ✅ android:name=\".MyApplication\" в AndroidManifest"

# 7. MainActivity safety net — FirebaseApp.initializeApp(this) и тук
if ! grep -q "FirebaseApp.initializeApp" "$MAIN_ACTIVITY"; then
  if ! grep -q "com.google.firebase.FirebaseApp" "$MAIN_ACTIVITY"; then
    sed -i.bak "s|^package \(.*\);|package \1;\n\nimport com.google.firebase.FirebaseApp;|" "$MAIN_ACTIVITY"
  fi
  if grep -q "super.onCreate" "$MAIN_ACTIVITY"; then
    awk '
      /super\.onCreate/ && !done {
        print
        print "        FirebaseApp.initializeApp(this);"
        done=1
        next
      }
      { print }
    ' "$MAIN_ACTIVITY" > "$MAIN_ACTIVITY.tmp" && mv "$MAIN_ACTIVITY.tmp" "$MAIN_ACTIVITY"
  fi
  rm -f "$MAIN_ACTIVITY.bak"
fi
echo "  ✅ MainActivity safety-net Firebase init"

echo ""
echo "✅ Android Firebase patch complete."
echo "   Може да отвориш проекта с: npx cap open android"
