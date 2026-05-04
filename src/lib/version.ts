// Single source of truth за версията на приложението.
// При всеки нов билд: ъпдейтни APP_VERSION ТУК и versionName/versionCode в android/app/build.gradle.
export const APP_VERSION = '1.0.15';

import { isNative } from '@/services/platform';

export type AppVersionInfo = {
  version: string;        // web/fallback версия
  nativeVersion?: string; // реална версия от native (Android/iOS)
  nativeBuild?: string;   // build number / versionCode
};

export async function getAppVersionInfo(): Promise<AppVersionInfo> {
  const info: AppVersionInfo = { version: APP_VERSION };
  if (!isNative()) return info;
  try {
    const { App } = await import('@capacitor/app');
    const native = await App.getInfo();
    info.nativeVersion = native.version;
    info.nativeBuild = native.build;
  } catch {
    /* ignore — fallback към web версията */
  }
  return info;
}
