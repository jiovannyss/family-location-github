/**
 * Device abstraction layer.
 *
 * Web: derives platform from userAgent.
 * Capacitor: replace with @capacitor/device:
 *   import { Device } from '@capacitor/device';
 *   const info = await Device.getInfo();
 */

export type DevicePlatform = 'web' | 'mobile-web' | 'ios' | 'android';

export interface DeviceInfo {
  platform: DevicePlatform;
  userAgent: string;
  isNative: boolean;
}

export function getDeviceInfo(): DeviceInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  return {
    platform: isMobile ? 'mobile-web' : 'web',
    userAgent: ua,
    isNative: false, // becomes true once Capacitor.isNativePlatform() is wired
  };
}
