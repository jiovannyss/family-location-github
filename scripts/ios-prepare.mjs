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

  write(APP_DELEGATE, src);
  info('   ✓ AppDelegate marked without injecting deprecated Capacitor observer');
}

// =========================================================================
// 4) Entitlements stub (Push + APS environment)
// =========================================================================
function patchEntitlements() {
  // Capacitor генерира base App.entitlements, но Push Notifications
  // capability добавя `aps-environment`. Не пипаме — Xcode го управлява
  // когато Capability "Push Notifications" е добавен. Само логваме статус.
  if (!exists(ENTITLEMENTS)) {
    info('   ℹ App.entitlements липсва — ще се създаде от Xcode когато добавиш Push Notifications capability.');
    return;
  }
  const src = read(ENTITLEMENTS);
  if (!src.includes('aps-environment')) {
    info('   ⚠ aps-environment липсва в App.entitlements');
    info('     → Отвори Xcode → таргет App → Signing & Capabilities → + Capability → Push Notifications');
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
  patchAppDelegate();
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
