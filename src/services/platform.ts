/**
 * Single source of truth for "are we running inside Capacitor (native shell)?".
 * Use this instead of sniffing userAgent in service modules.
 */
import { Capacitor } from '@capacitor/core';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  try {
    const p = Capacitor.getPlatform();
    if (p === 'ios' || p === 'android') return p;
    return 'web';
  } catch {
    return 'web';
  }
}
