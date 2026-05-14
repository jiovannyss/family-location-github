/**
 * Wrapper над native bridge plugins за пълно background-location управление.
 *
 * Android (`BgLocationBridge`): на 11+ системният prompt няма "Allow all the time"
 * опция — затова имаме отделен upgrade flow през настройките.
 *
 * iOS (`IosLocationBridge`): системата дава достъп до "When In Use" първо,
 * а "Always" — само със втори, отделен prompt (или ръчно в Settings).
 * Нашият bridge експозира status (`authorizedAlways` vs `authorizedWhenInUse`),
 * `requestAlways()` и `openAppSettings()`.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { isNative, nativePlatform } from './platform';

export type PermState = 'granted' | 'denied' | 'unknown';

export interface BgPermissionStatus {
  foreground: PermState;
  background: PermState;
  /** Timestamp (ms) кога нативният service последно е failвал заради липсваща background permission. 0 = няма. */
  missingDetectedAt: number;
  /** Платформо-специфичен debug стринг — за UI логи */
  rawStatus?: string;
}

export interface NativeTrackingStartResult {
  started: boolean;
  bridgeAvailable: boolean;
  reason?: string;
  rawStatus?: string;
  error?: string;
}

interface BgBridgePlugin {
  check(): Promise<{ foreground: string; background: string; sdkInt: number; missingDetectedAt: number }>;
  requestBackground(): Promise<{ background: string }>;
  openAppSettings(): Promise<void>;
  clearMissingFlag(): Promise<void>;
}

interface IosBridgePlugin {
  check(): Promise<{ foreground: string; background: string; rawStatus: string; missingDetectedAt: number }>;
  requestForeground(): Promise<{ foreground: string }>;
  requestAlways(): Promise<{ background: string }>;
  openAppSettings(): Promise<void>;
  startTracking(): Promise<{ started: boolean; reason?: string; rawStatus?: string }>;
  stopTracking(): Promise<void>;
  startSlc(): Promise<{ started: boolean }>;
  stopSlc(): Promise<void>;
  clearMissingFlag(): Promise<void>;
}

const AndroidBridge = registerPlugin<BgBridgePlugin>('BgLocationBridge');
const IosBridge = registerPlugin<IosBridgePlugin>('IosLocationBridge');

function isAndroidNative(): boolean {
  return isNative() && nativePlatform() === 'android';
}
function isIosNative(): boolean {
  return isNative() && nativePlatform() === 'ios';
}

function normalize(v: string | undefined): PermState {
  if (v === 'granted') return 'granted';
  if (v === 'denied') return 'denied';
  return 'unknown';
}

/**
 * Поискай foreground (`When In Use` на iOS, `location` на Android).
 */
export async function ensureForegroundLocation(): Promise<PermState> {
  if (!isNative()) return 'unknown';
  try {
    const cur = await Geolocation.checkPermissions();
    if (cur.location === 'granted') return 'granted';
    const r = await Geolocation.requestPermissions({ permissions: ['location'] });
    return normalize(r.location);
  } catch {
    return 'unknown';
  }
}

export async function checkBackgroundPermission(): Promise<BgPermissionStatus> {
  if (isAndroidNative()) {
    try {
      const r = await AndroidBridge.check();
      return {
        foreground: normalize(r.foreground),
        background: normalize(r.background),
        missingDetectedAt: r.missingDetectedAt || 0,
      };
    } catch {
      return { foreground: 'unknown', background: 'unknown', missingDetectedAt: 0 };
    }
  }
  if (isIosNative()) {
    try {
      const r = await IosBridge.check();
      return {
        foreground: normalize(r.foreground),
        background: normalize(r.background),
        missingDetectedAt: r.missingDetectedAt || 0,
        rawStatus: r.rawStatus,
      };
    } catch {
      try {
        const cur = await Geolocation.checkPermissions();
        const fg = normalize(cur.location);
        return { foreground: fg, background: fg, missingDetectedAt: 0 };
      } catch {
        return { foreground: 'unknown', background: 'unknown', missingDetectedAt: 0 };
      }
    }
  }
  try {
    const cur = await Geolocation.checkPermissions();
    const fg = normalize(cur.location);
    return { foreground: fg, background: fg, missingDetectedAt: 0 };
  } catch {
    return { foreground: 'unknown', background: 'unknown', missingDetectedAt: 0 };
  }
}

/**
 * Поискай background ("Always" на iOS, ACCESS_BACKGROUND_LOCATION на Android).
 *
 * Android 11+: системата отваря Settings вместо да покаже prompt.
 * iOS: ако имаме WhenInUse, показва "Change to Always Allow" prompt.
 */
export async function requestBackgroundPermission(): Promise<PermState> {
  if (isAndroidNative()) {
    try {
      const r = await AndroidBridge.requestBackground();
      return normalize(r.background);
    } catch {
      return 'unknown';
    }
  }
  if (isIosNative()) {
    try {
      const r = await IosBridge.requestAlways();
      return normalize(r.background);
    } catch {
      return 'unknown';
    }
  }
  return 'unknown';
}

export async function openAppSettings(): Promise<void> {
  if (isAndroidNative()) {
    await AndroidBridge.openAppSettings();
    return;
  }
  if (isIosNative()) {
    await IosBridge.openAppSettings();
    return;
  }
  throw new Error('Not native');
}

export async function clearBackgroundMissingFlag(): Promise<void> {
  if (isAndroidNative()) {
    try { await AndroidBridge.clearMissingFlag(); } catch { /* ignore */ }
    return;
  }
  if (isIosNative()) {
    try { await IosBridge.clearMissingFlag(); } catch { /* ignore */ }
  }
}

/**
 * Стартира native background tracking на iOS.
 *
 * Ако permission е само While Using, връща подробен status, но НЕ хвърля,
 * за да може JS foreground fallback-ът да продължи да работи.
 */
export async function startNativeBackgroundMonitoring(): Promise<NativeTrackingStartResult> {
  if (!isIosNative()) {
    return {
      started: false,
      bridgeAvailable: false,
      reason: 'not_ios',
    };
  }

  try {
    const status = await checkBackgroundPermission();
    const rawStatus = status.rawStatus;
    const result = await IosBridge.startTracking();
    return {
      started: !!result.started,
      bridgeAvailable: true,
      reason: result.reason,
      rawStatus: result.rawStatus ?? rawStatus,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'iOS startTracking failed';
    console.error('[bg-perm] iOS startTracking failed', e);
    let rawStatus: string | undefined;
    try {
      rawStatus = (await checkBackgroundPermission()).rawStatus;
    } catch {
      rawStatus = undefined;
    }
    return {
      started: false,
      bridgeAvailable: true,
      rawStatus,
      error,
    };
  }
}

export async function stopNativeBackgroundMonitoring(): Promise<void> {
  if (!isIosNative()) return;
  try {
    await IosBridge.stopTracking();
  } catch (e) {
    console.error('[bg-perm] iOS stopTracking failed', e);
  }
}

export function isBackgroundPermissionRelevant(): boolean {
  return isAndroidNative() || isIosNative();
}

export function platformLabels() {
  if (isIosNative()) {
    return {
      alwaysOption: 'Винаги',
      settingsPath: 'Настройки → Поверителност → Услуги за локация → Семейна локация → Винаги',
      restrictionNote: 'На iPhone фоновото обновяване работи само ако разрешението е „Винаги“. Ако е „Докато използвам приложението“, споделянето ще работи само на отворен екран.',
    };
  }
  return {
    alwaysOption: 'Позволи винаги',
    settingsPath: 'Настройки → Apps → Семейна локация → Permissions → Location → Allow all the time',
    restrictionNote: 'За пълно споделяне приложението изисква отделно потвърждение за достъп „Винаги" — затова този избор не е в първоначалния прозорец.',
  };
}

void Capacitor;
