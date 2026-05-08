/**
 * Geolocation abstraction layer.
 *
 * Web: navigator.geolocation (foreground only).
 * Native (Capacitor): @capacitor/geolocation. За истинско background tracking
 * на iOS/Android по-късно добави @capacitor-community/background-geolocation
 * и пренасочи неговите callback-и през този watchPosition.
 */
import { Geolocation } from '@capacitor/geolocation';
import { isNative } from './platform';
import { storage } from './storage';

export interface Coords {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
}

// ---------- Last-known position cache ----------
// Used by the locked-screen `location_refresh` push handler as a safe fallback
// when `getCurrentPosition` fails (Android often can't acquire fresh GPS while
// the screen is locked). NEVER report cached coords as fresh — the push
// handler uploads them with source=push_location_refresh_cached_fallback.
const LAST_KNOWN_KEY = 'geo_last_known';
let lastKnownMem: Coords | null = null;

export async function cacheLastKnownCoords(coords: Coords): Promise<void> {
  lastKnownMem = coords;
  try { await storage.set(LAST_KNOWN_KEY, JSON.stringify(coords)); } catch { /* ignore */ }
}

export async function getLastKnownCoords(): Promise<Coords | null> {
  if (lastKnownMem) return lastKnownMem;
  try {
    const v = await storage.get(LAST_KNOWN_KEY);
    if (!v) return null;
    const parsed = JSON.parse(v) as Coords;
    if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') {
      lastKnownMem = parsed;
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

export interface PermissionResult {
  state: 'granted' | 'denied' | 'prompt' | 'unknown';
}

export interface GetCurrentPositionOptions {
  timeoutMs?: number;
  enableHighAccuracy?: boolean;
  maximumAgeMs?: number;
}

export interface GeolocationService {
  isAvailable(): boolean;
  checkPermission(): Promise<PermissionResult>;
  getCurrentPosition(opts?: GetCurrentPositionOptions): Promise<Coords>;
  watchPosition(cb: (coords: Coords) => void, onError?: (err: Error) => void): () => void;
}

class WebGeolocation implements GeolocationService {
  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }
  async checkPermission(): Promise<PermissionResult> {
    try {
      const perms = (navigator as Navigator).permissions;
      if (!perms?.query) return { state: 'unknown' };
      const status = await perms.query({ name: 'geolocation' as PermissionName });
      return { state: status.state as PermissionResult['state'] };
    } catch {
      return { state: 'unknown' };
    }
  }
  getCurrentPosition(opts?: GetCurrentPositionOptions): Promise<Coords> {
    const timeout = opts?.timeoutMs ?? 10000;
    const enableHighAccuracy = opts?.enableHighAccuracy ?? true;
    const maximumAge = opts?.maximumAgeMs ?? 60000;
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) { reject(new Error('Geolocation not available')); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c: Coords = {
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null, timestamp: pos.timestamp,
          };
          void cacheLastKnownCoords(c);
          resolve(c);
        },
        (err) => reject(new Error(err.message || 'Location error')),
        { enableHighAccuracy, timeout, maximumAge }
      );
    });
  }
  watchPosition(cb: (coords: Coords) => void, onError?: (err: Error) => void): () => void {
    if (!this.isAvailable()) { onError?.(new Error('Geolocation not available')); return () => {}; }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c: Coords = {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null, timestamp: pos.timestamp,
        };
        void cacheLastKnownCoords(c);
        cb(c);
      },
      (err) => onError?.(new Error(err.message || 'Location error')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }
}

class NativeGeolocation implements GeolocationService {
  isAvailable(): boolean { return true; }
  async checkPermission(): Promise<PermissionResult> {
    try {
      const r = await Geolocation.checkPermissions();
      const v = r.location;
      if (v === 'granted') return { state: 'granted' };
      if (v === 'denied') return { state: 'denied' };
      if (v === 'prompt' || v === 'prompt-with-rationale') return { state: 'prompt' };
      return { state: 'unknown' };
    } catch {
      return { state: 'unknown' };
    }
  }
  async getCurrentPosition(): Promise<Coords> {
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted') {
      const req = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (req.location !== 'granted') throw new Error('Location permission denied');
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    return {
      lat: pos.coords.latitude, lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null, timestamp: pos.timestamp,
    };
  }
  watchPosition(cb: (coords: Coords) => void, onError?: (err: Error) => void): () => void {
    let watchId: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted') {
          const req = await Geolocation.requestPermissions({ permissions: ['location'] });
          if (req.location !== 'granted') { onError?.(new Error('Location permission denied')); return; }
        }
        if (cancelled) return;
        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (pos, err) => {
            if (err) { onError?.(new Error(err.message || 'Location error')); return; }
            if (!pos) return;
            cb({
              lat: pos.coords.latitude, lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? null, timestamp: pos.timestamp,
            });
          }
        );
      } catch (e) {
        onError?.(e instanceof Error ? e : new Error('Geolocation error'));
      }
    })();
    return () => {
      cancelled = true;
      if (watchId) Geolocation.clearWatch({ id: watchId }).catch(() => {});
    };
  }
}

export const geolocation: GeolocationService = isNative() ? new NativeGeolocation() : new WebGeolocation();
