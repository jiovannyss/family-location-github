/**
 * @deprecated Import from `@/services/deviceId` instead. This shim is kept
 * temporarily so old call sites keep working.
 */
export { getDeviceId, getDeviceIdAsync } from '@/services/deviceId';

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
