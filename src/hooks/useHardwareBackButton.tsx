/**
 * Hardware back button handling за Android (Capacitor).
 * Когато сме на главната страница ("/"), back минимизира приложението вместо
 * да навигира назад в history-то (което би могло да изпрати потребителя обратно
 * в /auth и да изисква нов login).
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isNative } from '@/services/platform';

export function useHardwareBackButton() {
  const location = useLocation();

  useEffect(() => {
    if (!isNative()) return;

    let remove: (() => void) | null = null;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          if (location.pathname === '/') {
            // На главната страница → минимизирай приложението вместо exit/back в auth
            App.minimizeApp().catch(() => { /* ignore */ });
            return;
          }
          if (canGoBack) {
            window.history.back();
          } else {
            App.minimizeApp().catch(() => { /* ignore */ });
          }
        });
        remove = () => { void handle.remove(); };
      } catch (e) {
        console.warn('[backButton] setup failed', e);
      }
    })();

    return () => { if (remove) remove(); };
  }, [location.pathname]);
}
