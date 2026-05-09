/**
 * Следи състоянието на background-location permission на Android.
 *
 * Refresh се прави при:
 *   - mount
 *   - app става активен (Capacitor appStateChange)
 *   - document.visibilitychange (по-надежден от appStateChange при връщане
 *     от системните настройки на някои устройства)
 *   - window focus
 *   - експозиран `refresh()` callback (за UI след затваряне на диалог)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const disposedRef = useRef(false);

  const refresh = useCallback(async () => {
    const s = await checkBackgroundPermission();
    if (disposedRef.current) return;
    setStatus(s);
    if (s.background !== 'granted' && s.missingDetectedAt > 0) {
      setAutoPromptForFailure(true);
      await clearBackgroundMissingFlag();
    }
  }, []);

  useEffect(() => {
    const platform = nativePlatform();
    if (!enabled || !isNative() || (platform !== 'android' && platform !== 'ios')) return;

    disposedRef.current = false;
    void refresh();

    let listenerHandle: { remove: () => Promise<void> } | null = null;
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh();
    }).then((h) => { listenerHandle = h; });

    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onFocus = () => { void refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    // Polling backup докато permission още не е granted (отваря се settings,
    // потребителят сменя, връща се — гарантирано хващаме и без events).
    const interval = window.setInterval(() => {
      if (disposedRef.current) return;
      void refresh();
    }, 3000);

    return () => {
      disposedRef.current = true;
      if (listenerHandle) void listenerHandle.remove();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [enabled, refresh]);

  return {
    status,
    autoPromptForFailure,
    dismissAutoPrompt: () => setAutoPromptForFailure(false),
    refresh,
  };
}
