import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@/services/notifications';
import { storage } from '@/services/storage';
import { toast } from 'sonner';

const ASKED_KEY = 'notif_permission_asked_v1';

type PermState = 'granted' | 'denied' | 'default' | 'unsupported';

function currentPermission(): PermState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as PermState;
}

export function useNotificationPermission() {
  const [permission, setPermission] = useState<PermState>(() => currentPermission());
  const [hasAsked, setHasAsked] = useState<boolean | null>(null);

  useEffect(() => {
    storage.get(ASKED_KEY).then((v) => setHasAsked(v === '1'));
  }, []);

  const markAsked = useCallback(async () => {
    await storage.set(ASKED_KEY, '1');
    setHasAsked(true);
  }, []);

  const request = useCallback(async (): Promise<PermState> => {
    const result = await notifications.requestPermission();
    setPermission(result as PermState);
    await markAsked();
    if (result === 'granted') {
      toast.success('Известията са включени');
    } else if (result === 'denied') {
      toast.info('Известията са изключени. Може да ги разрешите от настройките на браузъра.');
    }
    return result as PermState;
  }, [markAsked]);

  const dismiss = useCallback(async () => {
    await markAsked();
  }, [markAsked]);

  return {
    permission,
    hasAsked,
    /** Should we show a prompt UI? */
    shouldPrompt:
      permission === 'default' && hasAsked === false,
    /** Can we ask the OS for permission right now? */
    canRequest: permission === 'default',
    request,
    dismiss,
  };
}
