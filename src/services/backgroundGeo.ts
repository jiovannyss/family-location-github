/**
 * Background geolocation (native only).
 *
 * Web: no-op — браузърите не позволяват реално background tracking.
 * Native (Capacitor): използва @capacitor-community/background-geolocation,
 * което продължава да получава GPS позиции дори когато приложението е
 * минимизирано или екранът е заключен.
 *
 * Извиква callback-а със същия Coords тип като foreground geolocation,
 * така че `useLocationTracking` може да го използва прозрачно.
 */
import { registerPlugin } from '@capacitor/core';
import { isNative, nativePlatform } from './platform';
import type { Coords } from './geolocation';

interface BackgroundLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  time: number;
}
interface BgGeoCallbackError { code: string; message: string }

interface BgGeoOptions {
  backgroundMessage?: string;
  backgroundTitle?: string;
  requestPermissions?: boolean;
  stale?: boolean;
  distanceFilter?: number;
}
interface BgGeoPlugin {
  addWatcher(
    options: BgGeoOptions,
    callback: (location: BackgroundLocation | null, error: BgGeoCallbackError | null) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

let BackgroundGeolocation: BgGeoPlugin | null = null;
if (isNative()) {
  try {
    BackgroundGeolocation = registerPlugin<BgGeoPlugin>('BackgroundGeolocation');
  } catch (e) {
    console.warn('[backgroundGeo] plugin register failed', e);
    BackgroundGeolocation = null;
  }
}

export interface BackgroundGeoHandle {
  stop: () => Promise<void>;
}

export function isBackgroundGeoSupported(): boolean {
  return isNative();
}

/**
 * Стартира background tracking. Връща handle за спиране.
 * На web връща no-op handle.
 */
export async function startBackgroundGeolocation(
  onLocation: (coords: Coords) => void,
  onError?: (err: Error) => void
): Promise<BackgroundGeoHandle> {
  if (!BackgroundGeolocation) {
    return { stop: async () => {} };
  }

  let watcherId: string | null = null;
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: 'Семейна Локация споделя позицията ви.',
        backgroundTitle: 'Споделяне на местоположение',
        requestPermissions: true,
        stale: false,
        distanceFilter: 50, // метра — спестява батерия
      },
      (location, error) => {
        if (error) {
          // 'NOT_AUTHORIZED' → потребителят е отказал permission
          onError?.(new Error(error.message || error.code));
          return;
        }
        if (!location) return;
        onLocation({
          lat: location.latitude,
          lng: location.longitude,
          accuracy: location.accuracy ?? null,
          timestamp: location.time,
        });
      }
    );
  } catch (e) {
    onError?.(e instanceof Error ? e : new Error('Background geolocation error'));
    return { stop: async () => {} };
  }

  return {
    stop: async () => {
      if (watcherId && BackgroundGeolocation) {
        try { await BackgroundGeolocation.removeWatcher({ id: watcherId }); } catch { /* ignore */ }
      }
    },
  };
}

export async function openBackgroundGeoSettings(): Promise<void> {
  if (BackgroundGeolocation) {
    try { await BackgroundGeolocation.openSettings(); } catch { /* ignore */ }
  }
}

export function currentNativePlatform() {
  return nativePlatform();
}
