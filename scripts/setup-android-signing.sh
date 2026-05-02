#!/usr/bin/env bash
#
# Подготвя Gradle release signing config за Android.
#
# Чете keystore + credentials от environment variables (които в CI идват от
# GitHub Secrets, а локално — от твоя shell). Никога не commit-ва нищо
# чувствително — keystore-ът се decode-ва извън git tree-то и `key.properties`
# се пише на runtime.
#
# Изисквани env vars:
#   ANDROID_KEYSTORE_BASE64   — целият .keystore/.jks файл, base64-кодиран
#   ANDROID_KEYSTORE_PASSWORD
#   ANDROID_KEY_ALIAS
#   ANDROID_KEY_PASSWORD

set -euo pipefail

: "${ANDROID_KEYSTORE_BASE64:?ANDROID_KEYSTORE_BASE64 not set}"
: "${ANDROID_KEYSTORE_PASSWORD:?ANDROID_KEYSTORE_PASSWORD not set}"
: "${ANDROID_KEY_ALIAS:?ANDROID_KEY_ALIAS not set}"
: "${ANDROID_KEY_PASSWORD:?ANDROID_KEY_PASSWORD not set}"

KEYSTORE_PATH="$RUNNER_TEMP/release.keystore"
if [ -z "${RUNNER_TEMP:-}" ]; then
  KEYSTORE_PATH="/tmp/release.keystore"
fi

# Decode keystore
echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$KEYSTORE_PATH"

# Disable command echo before writing secrets to disk.
set +x

# key.properties (използва се от build.gradle)
cat > android/key.properties <<EOF
storeFile=$KEYSTORE_PATH
storePassword=$ANDROID_KEYSTORE_PASSWORD
keyAlias=$ANDROID_KEY_ALIAS
keyPassword=$ANDROID_KEY_PASSWORD
EOF

# Patch android/app/build.gradle да чете key.properties (идемпотентно)
BUILD_GRADLE="android/app/build.gradle"
if [ ! -f "$BUILD_GRADLE" ]; then
  echo "❌ $BUILD_GRADLE not found. Run 'npx cap add android' first."
  exit 1
fi

if ! grep -q "RELEASE_SIGNING_INJECTED" "$BUILD_GRADLE"; then
  # Backup
  cp "$BUILD_GRADLE" "$BUILD_GRADLE.bak"

  # Вмъкни signing config точно преди затварящата скоба на android { ... }
  python3 - "$BUILD_GRADLE" <<'PY'
import sys, re
p = sys.argv[1]
src = open(p).read()

inject = """
    // RELEASE_SIGNING_INJECTED
    signingConfigs {
        release {
            def kpFile = rootProject.file("key.properties")
            if (kpFile.exists()) {
                def kp = new Properties()
                kp.load(new FileInputStream(kpFile))
                storeFile file(kp['storeFile'])
                storePassword kp['storePassword']
                keyAlias kp['keyAlias']
                keyPassword kp['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
"""

# Намери "android {" блока и инжектирай преди последното "}" на същото ниво
m = re.search(r'\nandroid\s*\{', src)
if not m:
    print("Could not find android { block", file=sys.stderr); sys.exit(1)
start = m.end()
depth = 1
i = start
while i < len(src) and depth > 0:
    if src[i] == '{': depth += 1
    elif src[i] == '}': depth -= 1
    i += 1
if depth != 0:
    print("Unbalanced braces", file=sys.stderr); sys.exit(1)
end = i - 1  # позиция на затварящата скоба

new_src = src[:end] + inject + src[end:]
open(p, 'w').write(new_src)
print("Injected release signing config")
PY

  rm -f "$BUILD_GRADLE.bak"
fi

echo "✅ Signing config ready."
