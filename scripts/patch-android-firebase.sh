#!/usr/bin/env bash
#
# Идемпотентен patcher, който apply-ва Google Services Gradle plugin-а и
# гарантира експлицитна Firebase инициализация в MainActivity.
#
# Без това Push.register() crash-ва с:
#   "Default FirebaseApp is not initialized in this process"
# защото `google-services.json` не се обработва от build системата ако
# плъгинът не е apply-нат, а в редки случаи (Xiaomi/MIUI, custom Application
# class) auto-init на Firebase не се случва навреме.
#
# Извиква се ПОСЛЕ `npx cap sync android` и ПРЕДИ Gradle build.
# Безопасно е да се пуска многократно.
#
# Какво прави:
#   1. Добавя classpath 'com.google.gms:google-services:4.4.2' в
#      android/build.gradle.
#   2. Добавя apply plugin: 'com.google.gms.google-services' в
#      android/app/build.gradle (директен apply, не conditional).
#   3. Добавя firebase-bom + firebase-messaging dependencies.
#   4. Patch-ва MainActivity.java с explicit FirebaseApp.initializeApp(this).
#   5. Verify-ва, че android/app/google-services.json съществува.

set -euo pipefail

PROJECT_GRADLE="android/build.gradle"
APP_GRADLE="android/app/build.gradle"
GS_JSON="android/app/google-services.json"

if [ ! -f "$PROJECT_GRADLE" ] || [ ! -f "$APP_GRADLE" ]; then
  echo "❌ Android Gradle files not found. Run 'npx cap add android' / 'npx cap sync android' first."
  exit 1
fi

echo "🔧 Patching Firebase / google-services Gradle config"

# 0. google-services.json sanity check (рано — ако липсва, не пипай нищо)
if [ ! -s "$GS_JSON" ]; then
  echo "❌ $GS_JSON липсва или е празен. Прекъсвам преди да съм пипнал Gradle."
  exit 1
else
  echo "  ✅ google-services.json присъства ($(wc -c < "$GS_JSON") bytes)"
fi

# 1. Project-level classpath
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
    echo "  + classpath com.google.gms:google-services:4.4.2"
  else
    echo "  ⚠️  Не намерих съществуващ 'classpath ' ред в $PROJECT_GRADLE — пропускам."
  fi
else
  echo "  = classpath com.google.gms:google-services вече присъства"
fi

# 2. App-level apply plugin (директен apply най-долу — без if/conditional блок)
if grep -q "com.google.gms.google-services" "$APP_GRADLE"; then
  echo "  = apply plugin: com.google.gms.google-services вече присъства"
else
  printf "\napply plugin: 'com.google.gms.google-services'\n" >> "$APP_GRADLE"
  echo "  + apply plugin: com.google.gms.google-services"
fi

# 3. Firebase BOM + messaging dependencies (вмъкнати в съществуващия dependencies { } блок)
if grep -q "firebase-bom" "$APP_GRADLE"; then
  echo "  = firebase-bom вече присъства"
else
  # Намери последния '}' на dependencies { ... } блока и вмъкни преди него.
  # По-лесно: вмъкни след първия 'dependencies {' ред.
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
  echo "  + firebase-bom:33.7.0 + firebase-messaging"
fi

# 4. Explicit FirebaseApp.initializeApp(this) в MainActivity.java
MAIN_ACTIVITY=$(find android/app/src/main/java -name "MainActivity.java" | head -n1 || true)
if [ -z "$MAIN_ACTIVITY" ] || [ ! -f "$MAIN_ACTIVITY" ]; then
  echo "  ⚠️  MainActivity.java не намерен — пропускам explicit Firebase init."
else
  if grep -q "FirebaseApp.initializeApp" "$MAIN_ACTIVITY"; then
    echo "  = FirebaseApp.initializeApp вече присъства в MainActivity"
  else
    # Добави import com.google.firebase.FirebaseApp; ако липсва
    if ! grep -q "com.google.firebase.FirebaseApp" "$MAIN_ACTIVITY"; then
      sed -i.bak 's|^package \(.*\);|package \1;\n\nimport com.google.firebase.FirebaseApp;|' "$MAIN_ACTIVITY"
    fi

    # Ако има onCreate — добави FirebaseApp.initializeApp(this); след super.onCreate(...);
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
    else
      # Inject цял onCreate метод преди последния `}` на класа.
      # Намери последния `}` и вмъкни преди него.
      awk '
        { lines[NR] = $0 }
        END {
          # Намери последния `}`
          last_brace = 0
          for (i = NR; i >= 1; i--) {
            if (lines[i] ~ /^}/) { last_brace = i; break }
          }
          for (i = 1; i <= NR; i++) {
            if (i == last_brace) {
              print "    @Override"
              print "    public void onCreate(android.os.Bundle savedInstanceState) {"
              print "        super.onCreate(savedInstanceState);"
              print "        FirebaseApp.initializeApp(this);"
              print "    }"
            }
            print lines[i]
          }
        }
      ' "$MAIN_ACTIVITY" > "$MAIN_ACTIVITY.tmp" && mv "$MAIN_ACTIVITY.tmp" "$MAIN_ACTIVITY"
    fi
    rm -f "$MAIN_ACTIVITY.bak"
    echo "  + FirebaseApp.initializeApp(this) в $MAIN_ACTIVITY"
  fi
fi

echo "✅ Firebase Gradle + native init patched."
