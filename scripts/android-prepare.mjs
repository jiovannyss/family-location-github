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
  const gsSource = path.join(ROOT, 'config/android/google-services.json');
  const manifest = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');

  if (!exists(projectGradle)) fail(`${projectGradle} липсва. Пусни 'npx cap sync android' първо.`);
  if (!exists(appGradle)) fail(`${appGradle} липсва.`);
  if (!exists(manifest)) fail(`${manifest} липсва.`);

  info('🔧 Patching Android Firebase config');

  // 2.1 google-services.json — auto-copy from canonical source
  if (exists(gsSource)) {
    fs.copyFileSync(gsSource, gsJson);
    info(`  ✅ copied google-services.json from ${path.relative(ROOT, gsSource)} → ${path.relative(ROOT, gsJson)}`);
  }

  if (!exists(gsJson) || fs.statSync(gsJson).size === 0) {
    fail(`${path.relative(ROOT, gsJson)} липсва или е празен.
   - Сложи google-services.json на: ${path.relative(ROOT, gsSource)}
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
// 3) Native Stage 2: locked-screen / killed-app location refresh
// =========================================================================
function patchNativeLocation() {
  const nativeDir = path.join(ROOT, 'android-native');
  const appGradle = path.join(ROOT, 'android/app/build.gradle');
  const manifest = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');
  const javaRoot = path.join(ROOT, 'android/app/src/main/java');

  if (!exists(nativeDir)) fail(`android-native/ липсва — не мога да копирам native services.`);
  if (!exists(appGradle)) fail(`${appGradle} липсва.`);
  if (!exists(manifest)) fail(`${manifest} липсва.`);

  info('🔧 Patching native Android location service (Stage 2)');

  // 3.1 Намери package през MainActivity
  const mainActivity =
    findFile(javaRoot, 'MainActivity.java') ||
    findFile(javaRoot, 'MainActivity.kt');
  if (!mainActivity) fail('MainActivity.{java,kt} не е намерен.');
  const maSrc = read(mainActivity);
  const pkgMatch = maSrc.match(/^package\s+([^;\s]+)/m);
  if (!pkgMatch) fail('Не успях да extract-на package от MainActivity.');
  const pkg = pkgMatch[1];
  const appDir = path.dirname(mainActivity);
  info(`  ✅ package=${pkg}`);

  // 3.2 Изчисти стари .kt файлове (преди преминаването към Java)
  for (const stale of ['FamilyLocationMessagingService.kt', 'LocationRefreshForegroundService.kt']) {
    const p = path.join(appDir, stale);
    if (exists(p)) { fs.unlinkSync(p); info(`  - removed stale ${stale}`); }
  }

  // 3.3 Копирай Java файловете със заместен package
  const javaFiles = fs.readdirSync(nativeDir).filter((f) => f.endsWith('.java'));
  if (javaFiles.length === 0) fail('android-native/ не съдържа .java файлове.');
  for (const f of javaFiles) {
    const src = read(path.join(nativeDir, f)).replace(/__PACKAGE__/g, pkg);
    write(path.join(appDir, f), src);
    info(`  + ${f}`);
  }

  // 3.3b Регистрирай BgLocationBridge Capacitor plugin в MainActivity
  let maSrc2 = read(mainActivity);
  if (!maSrc2.includes('BgLocationBridge.class')) {
    // Гарантирай import за os.Bundle (за onCreate signature)
    if (!/import\s+android\.os\.Bundle;/.test(maSrc2)) {
      maSrc2 = maSrc2.replace(
        /(package\s+[^;]+;\s*)/,
        `$1\nimport android.os.Bundle;\n`
      );
    }
    if (/super\.onCreate\([^)]*\);/.test(maSrc2)) {
      // Има onCreate → вмъкни преди super.onCreate
      maSrc2 = maSrc2.replace(
        /(super\.onCreate\([^)]*\);)/,
        `registerPlugin(${pkg}.BgLocationBridge.class);\n        $1`
      );
    } else {
      // Празен MainActivity → инжектирай цял onCreate метод
      maSrc2 = maSrc2.replace(
        /(public\s+class\s+MainActivity[^{]*\{)/,
        `$1\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(${pkg}.BgLocationBridge.class);\n        super.onCreate(savedInstanceState);\n    }\n`
      );
    }
    write(mainActivity, maSrc2);
    info('  ✅ MainActivity: registerPlugin(BgLocationBridge.class)');
  } else {
    info('  = MainActivity вече регистрира BgLocationBridge');
  }

  // 3.4 Gradle dependencies (само play-services-location;
  //     HTTP се прави с HttpURLConnection от JDK -> няма okhttp).
  const deps = [
    'com.google.android.gms:play-services-location:21.3.0',
  ];
  let ag = read(appGradle);
  for (const dep of deps) {
    if (!ag.includes(dep)) {
      ag = ag.replace(
        /(dependencies\s*\{\s*\n)/,
        `$1    implementation '${dep}'\n`
      );
      info(`  + dep ${dep}`);
    }
  }
  write(appGradle, ag);

  // 3.4 Прочети Supabase URL/key от env / .env
  let SUPABASE_URL_VAL = process.env.VITE_SUPABASE_URL || '';
  let SUPABASE_ANON_VAL =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY || '';
  const envFile = path.join(ROOT, '.env');
  if ((!SUPABASE_URL_VAL || !SUPABASE_ANON_VAL) && exists(envFile)) {
    const envSrc = read(envFile);
    const pick = (k) => {
      const m = envSrc.match(new RegExp(`^${k}=(.*)$`, 'm'));
      return m ? m[1].replace(/^["']|["']$/g, '').trim() : '';
    };
    SUPABASE_URL_VAL = SUPABASE_URL_VAL || pick('VITE_SUPABASE_URL');
    SUPABASE_ANON_VAL =
      SUPABASE_ANON_VAL ||
      pick('VITE_SUPABASE_PUBLISHABLE_KEY') ||
      pick('VITE_SUPABASE_ANON_KEY');
  }
  if (!SUPABASE_URL_VAL || !SUPABASE_ANON_VAL) {
    info('⚠️  Липсват VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — meta-data ще е празно (native upload ще fail-ва).');
  }

  // 3.5 Manifest: xmlns:tools
  let m = read(manifest);
  if (!/xmlns:tools=/.test(m)) {
    m = m.replace(
      /<manifest(\s+xmlns:android="[^"]+")/,
      `<manifest$1 xmlns:tools="http://schemas.android.com/tools"`
    );
    info('  + xmlns:tools на <manifest>');
  }

  // 3.6 Премахни старите наши entries (idempotent)
  m = m.replace(/\s*<meta-data android:name="SUPABASE_URL"[^/]*\/>/g, '');
  m = m.replace(/\s*<meta-data android:name="SUPABASE_ANON_KEY"[^/]*\/>/g, '');
  m = m.replace(/\s*<service[^>]*android:name="\.FamilyLocationMessagingService"[\s\S]*?<\/service>/g, '');
  m = m.replace(/\s*<service[^>]*android:name="\.LocationRefreshForegroundService"[^/]*\/>/g, '');
  m = m.replace(/\s*<service[^>]*android:name="com\.capacitorjs\.plugins\.pushnotifications\.MessagingService"[^/]*\/>/g, '');

  // 3.7 Inject преди </application>
  const inject = `        <meta-data android:name="SUPABASE_URL" android:value="${SUPABASE_URL_VAL}" />
        <meta-data android:name="SUPABASE_ANON_KEY" android:value="${SUPABASE_ANON_VAL}" />

        <!-- Disable Capacitor's default MessagingService (нашият extends го) -->
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
`;
  if (!m.includes('</application>')) fail('Не намерих </application> в AndroidManifest.');
  m = m.replace('</application>', `${inject}    </application>`);
  write(manifest, m);

  info('  ✅ services + meta-data + Capacitor override в AndroidManifest.xml');
  info('✅ Native location service patch complete.');
}

// =========================================================================
// 4) Verify — задължителен hard check; fail-ва ако нещо липсва
// =========================================================================
function verifyAndroidStage2() {
  info('🔎 Verify Stage 2 integration');
  const errors = [];

  const manifest = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');
  const appGradle = path.join(ROOT, 'android/app/build.gradle');
  const javaRoot = path.join(ROOT, 'android/app/src/main/java');
  const mainActivity =
    findFile(javaRoot, 'MainActivity.java') ||
    findFile(javaRoot, 'MainActivity.kt');

  if (!exists(manifest)) errors.push('AndroidManifest.xml липсва');
  if (!exists(appGradle)) errors.push('android/app/build.gradle липсва');
  if (!mainActivity) errors.push('MainActivity не е намерен');

  if (mainActivity) {
    const appDir = path.dirname(mainActivity);
    for (const f of ['FamilyLocationMessagingService.java', 'LocationRefreshForegroundService.java']) {
      if (!exists(path.join(appDir, f))) errors.push(`native файл липсва: ${f}`);
    }
    // Старите .kt не трябва да остават
    for (const stale of ['FamilyLocationMessagingService.kt', 'LocationRefreshForegroundService.kt']) {
      if (exists(path.join(appDir, stale))) errors.push(`стар .kt файл трябва да се изтрие: ${stale}`);
    }
  }

  if (exists(manifest)) {
    const m = read(manifest);
    const requiredManifestTokens = [
      ['xmlns:tools', 'xmlns:tools на <manifest>'],
      ['.FamilyLocationMessagingService', 'service .FamilyLocationMessagingService'],
      ['.LocationRefreshForegroundService', 'service .LocationRefreshForegroundService'],
      ['tools:node="remove"', 'tools:node="remove" override на Capacitor MessagingService'],
      ['com.google.firebase.MESSAGING_EVENT', 'intent-filter MESSAGING_EVENT'],
      ['SUPABASE_URL', 'meta-data SUPABASE_URL'],
      ['SUPABASE_ANON_KEY', 'meta-data SUPABASE_ANON_KEY'],
    ];
    for (const [tok, label] of requiredManifestTokens) {
      if (!m.includes(tok)) errors.push(`manifest липсва: ${label}`);
    }
    const requiredPerms = [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
    ];
    for (const p of requiredPerms) {
      if (!m.includes(p)) errors.push(`permission липсва: ${p}`);
    }
  }

  if (exists(appGradle)) {
    const g = read(appGradle);
    const requiredDeps = [
      'play-services-location',
      'firebase-messaging',
    ];
    for (const d of requiredDeps) {
      if (!g.includes(d)) errors.push(`gradle dependency липсва: ${d}`);
    }
  }

  if (errors.length > 0) {
    console.error('❌ Stage 2 verify FAILED:');
    for (const e of errors) console.error(`   - ${e}`);
    console.error('');
    console.error('   Поправи pipeline-а или пусни наново: npm run android:prepare');
    process.exit(1);
  }
  info('✅ Stage 2 verify OK — native services, deps и permissions са на място.');
}

// =========================================================================
// Run
// =========================================================================
if (!exists(path.join(ROOT, 'android'))) {
  fail(`Папка android/ не съществува. Пусни първо:
   npm run build && npx cap add android && npx cap sync android`);
}

info('▶ 1/4  Patching AndroidManifest.xml');
patchManifest();
info('');
info('▶ 2/4  Patching Firebase / google-services');
patchFirebase();
info('');
info('▶ 3/4  Patching native location service (Stage 2)');
patchNativeLocation();
info('');
info('▶ 4/4  Verify');
verifyAndroidStage2();
info('');
info('🎉 Android проектът е готов за билд.');
info('   Следващи стъпки:');
info('     npx cap open android        # отваря Android Studio');
info('     или: cd android && ./gradlew assembleDebug   (Linux/macOS)');
info('         cd android && gradlew.bat assembleDebug  (Windows)');
info('   Debug logs: adb logcat -s FamLocNative:V');
