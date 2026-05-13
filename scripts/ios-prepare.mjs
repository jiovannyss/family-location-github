#!/usr/bin/env node
/**
 * Cross-platform iOS prepare script (трябва да се пуска на macOS — Xcode build
 * след това става там).
 *
 * Извикай след `npx cap sync ios`:
 *   npm run ios:prepare
 *
 * Прави:
 *   1. Patch на Info.plist (NSLocation* permission strings + UIBackgroundModes)
 *   2. Копира ios-native/IosLocationBridge.swift в ios/App/App/
 *   3. Patch на AppDelegate.swift — регистрира IosLocationBridge plugin
 *   4. Гарантира че Push Notifications & Background Modes capabilities
 *      присъстват в App.entitlements (минимален stub — реално Capabilities
 *      се конфигурират в Xcode, но добавяме base entries)
 *
 * НЕ изисква CocoaPods stub-ове — Capacitor авто-регистрира @objc plugin
 * класове, които са в Compile Sources на App таргета.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const IOS_APP_DIR = path.join(ROOT, 'ios/App/App');
const INFO_PLIST = path.join(IOS_APP_DIR, 'Info.plist');
const APP_DELEGATE = path.join(IOS_APP_DIR, 'AppDelegate.swift');
const ENTITLEMENTS = path.join(IOS_APP_DIR, 'App.entitlements');
const SRC_BRIDGE = path.join(ROOT, 'ios-native/IosLocationBridge.swift');
const DST_BRIDGE = path.join(IOS_APP_DIR, 'IosLocationBridge.swift');
const SRC_GSI = path.join(ROOT, 'ios-native/GoogleService-Info.plist');
const DST_GSI = path.join(IOS_APP_DIR, 'GoogleService-Info.plist');

function fail(msg) { console.error(`❌ ${msg}`); process.exit(1); }
function info(msg) { console.log(msg); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, s) { fs.writeFileSync(p, s, 'utf8'); }
function exists(p) { return fs.existsSync(p); }

// =========================================================================
// 1) Info.plist — permission strings + background modes
// =========================================================================
function patchInfoPlist() {
  if (!exists(INFO_PLIST)) {
    fail(`Info.plist не намерен (${INFO_PLIST}). Пусни 'npx cap add ios' първо.`);
  }
  info(`🔧 Patching ${path.relative(ROOT, INFO_PLIST)}`);
  let src = read(INFO_PLIST);

  const ensureKey = (key, valueXml) => {
    if (src.includes(`<key>${key}</key>`)) return false;
    // Добавяме преди затварящия </dict></plist>
    const insertion = `\t<key>${key}</key>\n\t${valueXml}\n`;
    src = src.replace(/<\/dict>\s*<\/plist>\s*$/, insertion + '</dict>\n</plist>\n');
    info(`   + ${key}`);
    return true;
  };

  ensureKey(
    'NSLocationWhenInUseUsageDescription',
    '<string>Семейна локация използва местоположението ви, за да го споделя с членовете на вашите кръгове, докато приложението е отворено.</string>'
  );
  ensureKey(
    'NSLocationAlwaysAndWhenInUseUsageDescription',
    '<string>За да виждат близките ви къде сте в реално време (включително когато приложението е затворено), е нужен достъп „Винаги". Можете да го изключите по всяко време от Настройки.</string>'
  );
  ensureKey(
    'NSLocationAlwaysUsageDescription',
    '<string>Споделяне на местоположение с членовете на вашите кръгове, дори когато приложението работи на заден план.</string>'
  );
  ensureKey(
    'NSUserNotificationsUsageDescription',
    '<string>Получавайте съобщения от членовете на кръга си и важни известия за местоположение.</string>'
  );

  // UIBackgroundModes — добавяме като array ако липсва
  if (!src.includes('<key>UIBackgroundModes</key>')) {
    const block =
      '\t<key>UIBackgroundModes</key>\n' +
      '\t<array>\n' +
      '\t\t<string>location</string>\n' +
      '\t\t<string>fetch</string>\n' +
      '\t\t<string>remote-notification</string>\n' +
      '\t</array>\n';
    src = src.replace(/<\/dict>\s*<\/plist>\s*$/, block + '</dict>\n</plist>\n');
    info('   + UIBackgroundModes [location, fetch, remote-notification]');
  } else {
    // Уверяваме се че location, fetch, remote-notification са вътре
    const need = ['location', 'fetch', 'remote-notification'];
    const m = src.match(/<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/);
    if (m) {
      let arr = m[1];
      let changed = false;
      for (const v of need) {
        if (!arr.includes(`<string>${v}</string>`)) {
          arr += `\t\t<string>${v}</string>\n\t`;
          changed = true;
          info(`   + UIBackgroundModes.${v}`);
        }
      }
      if (changed) {
        src = src.replace(m[0], `<key>UIBackgroundModes</key>\n\t<array>${arr}</array>`);
      }
    }
  }

  write(INFO_PLIST, src);
}

// =========================================================================
// 2) Копирай Swift bridge
// =========================================================================
function copyBridge() {
  if (!exists(SRC_BRIDGE)) fail(`Source bridge missing: ${SRC_BRIDGE}`);
  info(`🔧 Copying IosLocationBridge.swift → ios/App/App/`);
  fs.copyFileSync(SRC_BRIDGE, DST_BRIDGE);
}

function copyGoogleServiceInfo() {
  if (!exists(SRC_GSI)) {
    info('   ⚠ ios-native/GoogleService-Info.plist липсва — Firebase Messaging НЯМА да работи на iOS!');
    return false;
  }
  info('🔧 Copying GoogleService-Info.plist → ios/App/App/');
  fs.copyFileSync(SRC_GSI, DST_GSI);
  return true;
}

// =========================================================================
// 3) Patch AppDelegate.swift — регистрирай plugin
// =========================================================================
function patchAppDelegate() {
  if (!exists(APP_DELEGATE)) {
    fail(`AppDelegate.swift не намерен (${APP_DELEGATE}).`);
  }
  info(`🔧 Patching ${path.relative(ROOT, APP_DELEGATE)}`);
  let src = read(APP_DELEGATE);

  // Маркер за идемпотентност
  const MARK = '// FAM_LOC_BRIDGE_REGISTERED';
  if (src.includes(MARK)) {
    info('   ✓ AppDelegate already patched');
    return;
  }

  // NOTE: Старият observer `.capacitorViewControllerLoaded` не съществува в
  // Capacitor 7 и чупи build-а. Не patch-ваме AppDelegate с невалиден код.
  // Регистрацията трябва да стане през custom CAPBridgeViewController
  // override на `capacitorDidLoad()`.

  src = src.replace(/return true/, `${MARK}\n        return true`);

  // ---------------------------------------------------------------------
  // КРИТИЧНО: Capacitor PushNotifications плъгинът зависи от това
  // AppDelegate-ът да препрати APNs callback-ите чрез NotificationCenter.
  // Стандартният Capacitor template ги има, но при ръчно редактирани
  // AppDelegate-и (или при upgrade) могат да липсват → `registration`
  // event никога не се firе-ва и Push.register() timeout-ва.
  // Идемпотентно вмъкваме методите ако не присъстват.
  // ---------------------------------------------------------------------
  const APNS_MARK = '// FAM_LOC_APNS_FORWARDERS';
  if (!src.includes(APNS_MARK) &&
      !src.includes('didRegisterForRemoteNotificationsWithDeviceToken')) {
    const block =
`\n    ${APNS_MARK}\n` +
`    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {\n` +
`        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)\n` +
`    }\n\n` +
`    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {\n` +
`        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)\n` +
`    }\n`;
    // Вмъкваме преди затварящата скоба на класа AppDelegate.
    // Намираме последната `}` в файла и слагаме block преди нея.
    const lastBrace = src.lastIndexOf('}');
    if (lastBrace > 0) {
      src = src.slice(0, lastBrace) + block + '\n' + src.slice(lastBrace);
      info('   + APNs forwarder methods (didRegisterForRemoteNotifications…)');
    }
  } else {
    info('   ✓ APNs forwarder methods already present');
  }

  write(APP_DELEGATE, src);
  info('   ✓ AppDelegate patched');
}

// =========================================================================
// 3b) Patch AppDelegate.swift — Firebase init (idempotent, отделно)
// =========================================================================
function patchAppDelegateFirebase() {
  if (!exists(APP_DELEGATE)) return;
  info(`🔧 Adding Firebase init to ${path.relative(ROOT, APP_DELEGATE)}`);
  let src = read(APP_DELEGATE);
  let changed = false;

  if (!src.includes('import FirebaseCore')) {
    src = src.replace(/import Capacitor/, 'import Capacitor\nimport FirebaseCore');
    changed = true;
    info('   + import FirebaseCore');
  }

  if (!src.includes('FirebaseApp.configure()')) {
    const m = src.match(/func application\([^)]*didFinishLaunchingWithOptions[^)]*\)[^{]*\{/);
    if (m) {
      const insertAt = m.index + m[0].length;
      src = src.slice(0, insertAt) +
        '\n        // FAM_LOC_FIREBASE_INIT\n        FirebaseApp.configure()\n' +
        src.slice(insertAt);
      changed = true;
      info('   + FirebaseApp.configure() в didFinishLaunchingWithOptions');
    } else {
      info('   ⚠ Не намерих didFinishLaunchingWithOptions — Firebase init НЕ е добавен');
    }
  }

  if (changed) write(APP_DELEGATE, src);
  else info('   ✓ Firebase init already present');
}

// =========================================================================
// 4) Entitlements stub (Push + APS environment)
// =========================================================================
function patchEntitlements() {
  // Capacitor генерира base App.entitlements. За да работи Push Notifications
  // (без ръчен Xcode click) автоматично добавяме `aps-environment=production`.
  // Production билд от App Store Connect използва production APNs автоматично.
  if (!exists(ENTITLEMENTS)) {
    info('   ⚠ App.entitlements липсва — създавам минимален с aps-environment');
    const stub =
`<?xml version="1.0" encoding="UTF-8"?>\n` +
`<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
`<plist version="1.0">\n<dict>\n` +
`\t<key>aps-environment</key>\n\t<string>production</string>\n` +
`</dict>\n</plist>\n`;
    write(ENTITLEMENTS, stub);
    info('   + App.entitlements created with aps-environment=production');
    return;
  }
  let src = read(ENTITLEMENTS);
  if (!src.includes('aps-environment')) {
    src = src.replace(/<\/dict>\s*<\/plist>\s*$/,
      `\t<key>aps-environment</key>\n\t<string>production</string>\n</dict>\n</plist>\n`);
    write(ENTITLEMENTS, src);
    info('   + aps-environment=production добавен в App.entitlements');
  } else {
    info('   ✓ aps-environment present');
  }
}

// =========================================================================
// MAIN
// =========================================================================
function main() {
  if (!exists(path.join(ROOT, 'ios/App'))) {
    fail("Папката 'ios/App' липсва. Пусни 'npx cap add ios' първо (само на macOS).");
  }
  patchInfoPlist();
  copyBridge();
  copyGoogleServiceInfo();
  patchAppDelegate();
  patchAppDelegateFirebase();
  patchEntitlements();
  info('✅ iOS prepare готово.');
  info('');
  info('Следващи стъпки в Xcode:');
  info('  1. npx cap open ios');
  info('  2. Signing & Capabilities → твоя Team');
  info('  3. + Capability → Push Notifications');
  info('  4. + Capability → Background Modes → Location updates, Background fetch, Remote notifications');
  info('  5. ⌘B (build) и пусни на устройство/симулатор');
  info('');
  info('Пълен checklist: resources/IOS_BACKGROUND_SETUP.md');
}

main();
