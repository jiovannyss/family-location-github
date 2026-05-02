/**
 * Stable per-device identifier.
 *
 * Web: persisted in storage (localStorage today, Capacitor Preferences later).
 * Capacitor: consider @capacitor/device → Device.getId() and store the result here.
 */
import { storage } from './storage';

// Keep in sync with the legacy key so existing devices keep their id after upgrade.
const KEY = 'family_location_device_id';
let cached: string | null = null;

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  // Fallback (very unlikely on modern browsers)
  return 'dev-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

/**
 * Synchronous accessor (used at startup). Reads localStorage directly so it
 * works during the initial render. The async storage layer is the source of
 * truth otherwise.
 */
export function getDeviceId(): string {
  if (cached) return cached;
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const fresh = generateId();
    window.localStorage.setItem(KEY, fresh);
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
  if (existing) {
    cached = existing;
    return existing;
  }
  const fresh = generateId();
  await storage.set(KEY, fresh);
  cached = fresh;
  return fresh;
}
