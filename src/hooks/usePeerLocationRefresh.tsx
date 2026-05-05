import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useAuth } from './useAuth';
import { requestPeerLocationRefresh } from '@/services/locationRefresh';

/**
 * Когато потребителят отвори приложението (или го върне на преден план),
 * пращаме silent push до всички съ-членове в кръговете му, за да обновят
 * локациите си. Throttle-нато на client (30s) и server (60s).
 */
export function usePeerLocationRefresh() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    void requestPeerLocationRefresh();

    let handle: { remove: () => Promise<void> } | null = null;
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void requestPeerLocationRefresh();
    })
      .then((h) => { handle = h; })
      .catch(() => { /* not native */ });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void requestPeerLocationRefresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (handle) void handle.remove();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id]);
}
