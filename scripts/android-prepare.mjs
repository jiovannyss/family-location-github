#!/usr/bin/env node
/**
 * Cross-platform Android prepare script (Windows / macOS / Linux).
 *
 * Извикай след `npx cap sync android` чрез:
 *   npm run android:prepare
 *
 * Прави:
 *   1. Patch на AndroidManifest.xml (permissions, hardening, app label)
 *   2. Patch на Firebase config (google-services + MyApplication)
 *
 * Без зависимост от bash → работи и на нативен Windows (cmd / PowerShell).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}
function info(msg) { console.log(msg); }

function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, s) { fs.writeFileSync(p, s, 'utf8'); }
function exists(p) { return fs.existsSync(p); }

// =========================================================================
// 1) AndroidManifest patch
// =========================================================================
function patchManifest() {
  const manifest = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');
  if (!exists(manifest)) {
    fail(`AndroidManifest.xml не намерен на ${manifest}. Пусни 'npx cap add android' първо.`);
  }
  info(`🔧 Patching ${path.relative(ROOT, manifest)}`);
  let src = read(manifest);

  const perms = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.WAKE_LOCK',
    'android.permission.RECEIVE_BOOT_COMPLETED',
  ];
  for (const perm of perms) {
    if (!src.includes(perm)) {
      src = src.replace(
        '<application',
        `    <uses-permission android:name="${perm}" />\n    <application`
      );
      info(`  + ${perm}`);
    }
  }

  if (src.includes('android:usesCleartextTraffic="true"')) {
    src = src.replace('android:usesCleartextTraffic="true"', 'android:usesCleartextTraffic="false"');
    info('  ~ usesCleartextTraffic=false');
  }
  if (src.includes('android:allowBackup="true"')) {
    src = src.replace('android:allowBackup="true"', 'android:allowBackup="false"');
    info('  ~ allowBackup=false');
  }

  write(manifest, src);

  // strings.xml → app_name
  const strings = path.join(ROOT, 'android/app/src/main/res/values/strings.xml');
  if (exists(strings)) {
    let s = read(strings);
    s = s.replace(
      /(<string name="app_name">)[^<]*(<\/string>)/,
      '$1Семейна локация$2'
    );
    s = s.replace(
      /(<string name="title_activity_main">)[^<]*(<\/string>)/,
      '$1Семейна локация$2'
    );
    write(strings, s);
    info('  ~ app_name=Семейна локация');
  }

  info('✅ Manifest patched.');
}

// =========================================================================
// 2) Firebase patch
// =========================================================================
function patchFirebase() {
  const projectGradle = path.join(ROOT, 'android/build.gradle');
  const appGradle = path.join(ROOT, 'android/app/build.gradle');
  const gsJson = path.join(ROOT, 'android/app/google-services.json');
  const manifest = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');

  if (!exists(projectGradle)) fail(`${projectGradle} липсва. Пусни 'npx cap sync android' първо.`);
  if (!exists(appGradle)) fail(`${appGradle} липсва.`);
  if (!exists(manifest)) fail(`${manifest} липсва.`);

  info('🔧 Patching Android Firebase config');

  // 2.1 google-services.json
  if (!exists(gsJson) || fs.statSync(gsJson).size === 0) {
    fail(`${path.relative(ROOT, gsJson)} липсва или е празен.
   - Свали google-services.json от Firebase Console
   - Сложи го на: android/app/google-services.json
   - Пусни отново: npm run android:prepare`);
  }
  info(`  ✅ google-services.json (${fs.statSync(gsJson).size} bytes)`);

  // 2.2 classpath in project gradle
  let pg = read(projectGradle);
  if (!pg.includes('com.google.gms:google-services')) {
    if (!/classpath\s/.test(pg)) {
      fail(`Не намерих 'classpath ' в ${projectGradle} — нестандартна структура.`);
    }
    pg = pg.replace(
      /(classpath\s[^\n]*\n)/,
      `$1        classpath 'com.google.gms:google-services:4.4.2'\n`
    );
    write(projectGradle, pg);
  }
  if (!pg.includes('com.google.gms:google-services')) {
    fail('classpath google-services не беше добавен.');
  }
  info('  ✅ classpath com.google.gms:google-services:4.4.2');

  // 2.3 apply plugin in app gradle
  let ag = read(appGradle);
  if (!ag.includes('com.google.gms.google-services')) {
    ag += `\napply plugin: 'com.google.gms.google-services'\n`;
    write(appGradle, ag);
  }
  if (!ag.includes('com.google.gms.google-services')) {
    fail('apply plugin google-services не беше добавен.');
  }
  info('  ✅ apply plugin: com.google.gms.google-services');

  // 2.4 Firebase BOM + messaging
  ag = read(appGradle);
  if (!ag.includes('firebase-bom')) {
    ag = ag.replace(
      /(dependencies\s*\{\s*\n)/,
      `$1    implementation platform('com.google.firebase:firebase-bom:33.7.0')\n    implementation 'com.google.firebase:firebase-messaging'\n`
    );
    write(appGradle, ag);
  }
  if (!ag.includes('firebase-bom') || !ag.includes('firebase-messaging')) {
    fail('firebase-bom / firebase-messaging dependency не беше добавен.');
  }
  info('  ✅ firebase-bom:33.7.0 + firebase-messaging');

  // 2.5 MyApplication.java
  const javaRoot = path.join(ROOT, 'android/app/src/main/java');
  const mainActivity = findFile(javaRoot, 'MainActivity.java');
  if (!mainActivity) fail('MainActivity.java не намерен.');

  const maSrc = read(mainActivity);
  const pkgMatch = maSrc.match(/^package\s+([^;]+);/m);
  if (!pkgMatch) fail(`Не успях да extract-на package от ${mainActivity}.`);
  const pkg = pkgMatch[1];

  const myApp = path.join(path.dirname(mainActivity), 'MyApplication.java');
  write(myApp, `package ${pkg};

import android.app.Application;
import android.util.Log;
import com.google.firebase.FirebaseApp;

/**
 * Custom Application клас — гарантира, че FirebaseApp.initializeApp(this) е
 * извикан ПРЕДИ MainActivity, services и Capacitor plugins.
 *
 * Auto-генериран от scripts/android-prepare.mjs.
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
`);
  info(`  ✅ MyApplication.java (${pkg})`);

  // 2.6 android:name=".MyApplication" in manifest
  let m = read(manifest);
  if (m.includes('android:name=".MyApplication"')) {
    info('  = android:name=".MyApplication" вече присъства');
  } else if (/<application[^>]*android:name=/.test(m)) {
    fail('<application> вече има друг android:name. Премахни го ръчно.');
  } else {
    m = m.replace(/<application\s/, '<application android:name=".MyApplication" ');
    write(manifest, m);
  }
  if (!read(manifest).includes('android:name=".MyApplication"')) {
    fail('android:name=".MyApplication" не беше добавен в AndroidManifest.');
  }
  info('  ✅ android:name=".MyApplication" в AndroidManifest');

  // 2.7 MainActivity safety net
  let ma = read(mainActivity);
  if (!ma.includes('FirebaseApp.initializeApp')) {
    if (!ma.includes('com.google.firebase.FirebaseApp')) {
      ma = ma.replace(
        /^(package\s+[^;]+;)/m,
        `$1\n\nimport com.google.firebase.FirebaseApp;`
      );
    }
    ma = ma.replace(
      /(super\.onCreate\([^)]*\);)/,
      `$1\n        FirebaseApp.initializeApp(this);`
    );
    write(mainActivity, ma);
  }
  info('  ✅ MainActivity safety-net Firebase init');

  info('');
  info('✅ Android Firebase patch complete.');
}

function findFile(dir, name) {
  if (!exists(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    } else if (e.name === name) {
      return p;
    }
  }
  return null;
}

// =========================================================================
// Run
// =========================================================================
if (!exists(path.join(ROOT, 'android'))) {
  fail(`Папка android/ не съществува. Пусни първо:
   npm run build && npx cap add android && npx cap sync android`);
}

info('▶ 1/2  Patching AndroidManifest.xml');
patchManifest();
info('');
info('▶ 2/2  Patching Firebase / google-services');
patchFirebase();
info('');
info('🎉 Android проектът е готов за билд.');
info('   Следващи стъпки:');
info('     npx cap open android        # отваря Android Studio');
info('     или: cd android && ./gradlew assembleDebug   (Linux/macOS)');
info('         cd android && gradlew.bat assembleDebug  (Windows)');
