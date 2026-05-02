/**
 * Generates and persists a stable per-browser device identifier in localStorage.
 * Used to distinguish different browsers/devices for the same user account, so
 * "active device" semantics (only one device shares location at a time) work.
 */
const STORAGE_KEY = 'family_location_device_id';

function generateId(): string {
  // Prefer crypto.randomUUID when available
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length > 0) return existing;
    const fresh = generateId();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // localStorage unavailable (private mode, SSR) — fall back to ephemeral id
    return 'ephemeral';
  }
}

/**
 * Best-effort label describing the current device, shown to the user.
 */
export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Устройство';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone/iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mobile/.test(ua)) return 'Мобилно';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Устройство';
}
