/**
 * Stable per-device identifier.
 *
 * Web: persisted in storage (localStorage / Preferences depending on platform).
 * Native: Device.getId() seeded once and persisted (so it survives reinstall semantics
 * consistent with our backend assumptions).
 */
import { Device } from '@capacitor/device';
import { storage } from './storage';
import { isNative } from './platform';

const KEY = 'family_location_device_id';
let cached: string | null = null;

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return 'dev-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

/**
 * Synchronous accessor (used at startup). On native this may return a freshly
 * generated id on the very first launch; getDeviceIdAsync() will reconcile it
 * with the persisted/native id shortly after.
 */
export function getDeviceId(): string {
  if (cached) return cached;
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) { cached = existing; return existing; }
    const fresh = generateId();
    try { window.localStorage.setItem(KEY, fresh); } catch { /* ignore */ }
    cached = fresh;
    return fresh;
  } catch {
    if (!cached) cached = generateId();
    return cached;
  }
}

export async function getDeviceIdAsync(): Promise<string> {
  if (cached) return cached;
  const existing = await storage.get(KEY);
  if (existing) { cached = existing; return existing; }
  let fresh: string;
  if (isNative()) {
    try {
      const { identifier } = await Device.getId();
      fresh = identifier || generateId();
    } catch {
      fresh = generateId();
    }
  } else {
    fresh = generateId();
  }
  await storage.set(KEY, fresh);
  cached = fresh;
  return fresh;
}
