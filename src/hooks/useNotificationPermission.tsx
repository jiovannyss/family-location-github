import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@/services/notifications';
import { storage } from '@/services/storage';
import { toast } from 'sonner';
import { isNative } from '@/services/platform';
import { push } from '@/services/push';
import { supabase } from '@/integrations/supabase/client';

const ASKED_KEY = 'notif_permission_asked_v1';

type PermState = 'granted' | 'denied' | 'default' | 'unsupported';

async function readPermission(): Promise<PermState> {
  if (isNative()) {
    try {
      const m = await import('@capacitor/local-notifications');
      const r = await m.LocalNotifications.checkPermissions();
      if (r.display === 'granted') return 'granted';
      if (r.display === 'denied') return 'denied';
      return 'default';
    } catch {
      return 'default';
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as PermState;
}

export function useNotificationPermission() {
  const [permission, setPermission] = useState<PermState>('default');
  const [hasAsked, setHasAsked] = useState<boolean | null>(null);

  useEffect(() => {
    void readPermission().then(setPermission);
    storage.get(ASKED_KEY).then((v) => setHasAsked(v === '1'));
  }, []);

  const markAsked = useCallback(async () => {
    await storage.set(ASKED_KEY, '1');
    setHasAsked(true);
  }, []);

  const request = useCallback(async (): Promise<PermState> => {
    // Маркирай веднага като "asked" → UI prompt-ът изчезва даже ако
    // системният dialog още не е отговорил/потребителят го затвори.
    await markAsked();

    let result: PermState = 'default';
    try {
      result = (await notifications.requestPermission()) as PermState;
    } catch (e) {
      console.error('[notifications] requestPermission failed', e);
      toast.error('Грешка при заявка за известия');
    }

    setPermission(result);

    if (result === 'granted') {
      toast.success('Известията са включени');
    } else if (result === 'denied') {
      toast.info('Известията са изключени. Може да ги разрешите от настройките.');
    } else if (result === 'unsupported') {
      toast.info('Този браузър не поддържа известия.');
    }

    // На native: ако local notifications са granted → веднага искаме
    // и POST_NOTIFICATIONS за push (Android 13+) и регистрираме FCM token.
    if (isNative() && result === 'granted') {
      try {
        void supabase.auth.getSession().then(({ data: sess }) => {
          const uid = sess.session?.user?.id;
          if (!uid) return;
          // Не чакаме тук, за да не блокира UI при Android native permission edge-cases.
          void push.forceReregister(uid);
        });
      } catch (e) {
        console.warn('[notifications] push register after grant failed', e);
      }
    }

    return result;
  }, [markAsked]);

  const dismiss = useCallback(async () => {
    await markAsked();
  }, [markAsked]);

  return {
    permission,
    hasAsked,
    /** Should we show a prompt UI? */
    shouldPrompt: permission === 'default' && hasAsked === false,
    canRequest: permission === 'default',
    request,
    dismiss,
  };
}
