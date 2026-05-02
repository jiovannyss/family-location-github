/**
 * Geolocation abstraction layer.
 *
 * Web: uses navigator.geolocation (foreground only).
 * Capacitor: swap with @capacitor/geolocation. For background tracking on
 * Android/iOS use @capacitor-community/background-geolocation and pipe its
 * callbacks through `watchPosition` here. Keep the public API identical so
 * callers (hooks/components) need no changes.
 */

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
      // Some browsers (Safari) don't expose 'geolocation' to permissions.query
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
      if (!this.isAvailable()) {
        reject(new Error('Geolocation not available'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            timestamp: pos.timestamp,
          }),
        (err) => reject(new Error(err.message || 'Location error')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  watchPosition(cb: (coords: Coords) => void, onError?: (err: Error) => void): () => void {
    if (!this.isAvailable()) {
      onError?.(new Error('Geolocation not available'));
      return () => {};
    }
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        cb({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          timestamp: pos.timestamp,
        }),
      (err) => onError?.(new Error(err.message || 'Location error')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }
}

export const geolocation: GeolocationService = new WebGeolocation();
