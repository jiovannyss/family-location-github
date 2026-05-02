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

export interface Coords {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
}

export interface PermissionResult {
  state: 'granted' | 'denied' | 'prompt' | 'unknown';
}

export interface GeolocationService {
  isAvailable(): boolean;
  checkPermission(): Promise<PermissionResult>;
  getCurrentPosition(): Promise<Coords>;
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
  getCurrentPosition(): Promise<Coords> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) { reject(new Error('Geolocation not available')); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null, timestamp: pos.timestamp,
        }),
        (err) => reject(new Error(err.message || 'Location error')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }
  watchPosition(cb: (coords: Coords) => void, onError?: (err: Error) => void): () => void {
    if (!this.isAvailable()) { onError?.(new Error('Geolocation not available')); return () => {}; }
    const id = navigator.geolocation.watchPosition(
      (pos) => cb({
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null, timestamp: pos.timestamp,
      }),
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
