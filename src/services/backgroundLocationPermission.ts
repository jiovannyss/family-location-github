/**
 * Wrapper над native BgLocationBridge plugin (Android) с web fallback.
 *
 * На Android 11+ Google не позволява системният prompt да съдържа опция
 * „Allow all the time". Така че:
 *   1) Първо искаме foreground (`location`) през @capacitor/geolocation.
 *   2) После проверяваме background през този bridge.
 *   3) Ако background е denied → показваме UI диалог, който води
 *      потребителя към системните настройки.
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
}

interface BgBridgePlugin {
  check(): Promise<{ foreground: string; background: string; sdkInt: number; missingDetectedAt: number }>;
  requestBackground(): Promise<{ background: string }>;
  openAppSettings(): Promise<void>;
  clearMissingFlag(): Promise<void>;
}

const Bridge = registerPlugin<BgBridgePlugin>('BgLocationBridge');

function isAndroidNative(): boolean {
  return isNative() && nativePlatform() === 'android';
}

function normalize(v: string | undefined): PermState {
  if (v === 'granted') return 'granted';
  if (v === 'denied') return 'denied';
  return 'unknown';
}

/**
 * Поискай foreground (`location`) — стандартният Capacitor flow.
 * Връща финалното състояние.
 */
export async function ensureForegroundLocation(): Promise<PermState> {
  if (!isNative()) {
    // Web: при getCurrentPosition браузърът сам ще покаже prompt
    return 'unknown';
  }
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
  if (!isAndroidNative()) {
    // iOS обработва background чрез own „Always" prompt в Geolocation;
    // web няма background. За тези платформи приемаме че foreground = всичко.
    try {
      const cur = await Geolocation.checkPermissions();
      const fg = normalize(cur.location);
      return { foreground: fg, background: fg, missingDetectedAt: 0 };
    } catch {
      return { foreground: 'unknown', background: 'unknown', missingDetectedAt: 0 };
    }
  }
  try {
    const r = await Bridge.check();
    return {
      foreground: normalize(r.foreground),
      background: normalize(r.background),
      missingDetectedAt: r.missingDetectedAt || 0,
    };
  } catch {
    return { foreground: 'unknown', background: 'unknown', missingDetectedAt: 0 };
  }
}

/**
 * Опит да поискаме background permission. На Android 11+ това НЕ показва
 * диалог а отваря системните настройки на приложението — затова обикновено
 * предпочитаме `openAppSettings()` от UI с ясно обяснение.
 */
export async function requestBackgroundPermission(): Promise<PermState> {
  if (!isAndroidNative()) return 'unknown';
  try {
    const r = await Bridge.requestBackground();
    return normalize(r.background);
  } catch {
    return 'unknown';
  }
}

export async function openAppSettings(): Promise<void> {
  if (!isAndroidNative()) return;
  try { await Bridge.openAppSettings(); } catch { /* ignore */ }
}

export async function clearBackgroundMissingFlag(): Promise<void> {
  if (!isAndroidNative()) return;
  try { await Bridge.clearMissingFlag(); } catch { /* ignore */ }
}

export function isBackgroundPermissionRelevant(): boolean {
  // UI показваме само на Android native (на iOS Capacitor Geolocation
  // се грижи за това чрез системния "Always" prompt).
  return isAndroidNative();
}

// Suppress unused-import warning for Capacitor (тип guard)
void Capacitor;
