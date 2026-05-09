/**
 * Следи състоянието на background-location permission на Android.
 *
 * - При mount и всеки път когато app-ът става active, проверява
 *   foreground/background permission.
 * - Ако нативният service е failвал заради липсваща background permission
 *   (записан flag `fam_bg_perm_missing_at`), показва upgrade диалога
 *   автоматично и чисти flag-а.
 */
import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { isNative, nativePlatform } from '@/services/platform';
import {
  checkBackgroundPermission,
  clearBackgroundMissingFlag,
  type BgPermissionStatus,
} from '@/services/backgroundLocationPermission';

export function useBackgroundPermissionWatcher(enabled: boolean) {
  const [status, setStatus] = useState<BgPermissionStatus | null>(null);
  const [autoPromptForFailure, setAutoPromptForFailure] = useState(false);

  useEffect(() => {
    if (!enabled || !isNative() || nativePlatform() !== 'android') return;

    let disposed = false;

    const refresh = async () => {
      const s = await checkBackgroundPermission();
      if (disposed) return;
      setStatus(s);
      if (s.background !== 'granted' && s.missingDetectedAt > 0) {
        setAutoPromptForFailure(true);
        await clearBackgroundMissingFlag();
      }
    };

    void refresh();

    let listenerHandle: { remove: () => Promise<void> } | null = null;
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh();
    }).then((h) => { listenerHandle = h; });

    return () => {
      disposed = true;
      if (listenerHandle) void listenerHandle.remove();
    };
  }, [enabled]);

  return { status, autoPromptForFailure, dismissAutoPrompt: () => setAutoPromptForFailure(false) };
}
