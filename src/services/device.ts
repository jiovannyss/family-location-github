/**
 * Device abstraction layer.
 *
 * Web: derives platform from userAgent.
 * Native (Capacitor): uses @capacitor/device.
 */
import { Device } from '@capacitor/device';
import { isNative, nativePlatform } from './platform';

export type DevicePlatform = 'web' | 'mobile-web' | 'ios' | 'android';

export interface DeviceInfo {
  platform: DevicePlatform;
  userAgent: string;
  isNative: boolean;
}

export function getDeviceInfo(): DeviceInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (isNative()) {
    const p = nativePlatform();
    return { platform: p === 'ios' ? 'ios' : 'android', userAgent: ua, isNative: true };
  }
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  return { platform: isMobile ? 'mobile-web' : 'web', userAgent: ua, isNative: false };
}

/** Async helper for richer info on native (model, OS version, etc.). */
export async function getRichDeviceInfo() {
  if (isNative()) return Device.getInfo();
  return null;
}
