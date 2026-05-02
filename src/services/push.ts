/**
 * Push notifications service (native only).
 *
 * Web: no-op (използваме toast + Web Notifications от `notifications.ts`).
 * Native: регистрира устройството за push, получава FCM/APNs токен и го
 * записва в `push_tokens` таблицата, за да може backend-ът (edge function
 * `send-push`) да изпраща нотификации до правилните устройства.
 *
 * За да работи реално, нужно е:
 *   - Android: Firebase проект + `google-services.json` в `android/app/`.
 *   - iOS: Apple Developer акаунт + APNs key + Firebase iOS app + `GoogleService-Info.plist`.
 *   - Edge функция `send-push` с FCM service account JSON като secret.
 *
 * Виж README за подробности.
 */
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { isNative, nativePlatform } from './platform';
import { getDeviceIdAsync } from './deviceId';
import { notifications } from './notifications';

export interface PushService {
  isSupported(): boolean;
  registerForUser(userId: string): Promise<void>;
  unregisterForUser(userId: string): Promise<void>;
}

class NoopPushService implements PushService {
  isSupported() { return false; }
  async registerForUser() { /* no-op */ }
  async unregisterForUser() { /* no-op */ }
}

class NativePushService implements PushService {
  private listenersAttached = false;

  isSupported() { return true; }

  async registerForUser(userId: string): Promise<void> {
    try {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== 'granted') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') return;

      this.attachListeners(userId);
      await PushNotifications.register();
    } catch (e) {
      console.error('Push register failed:', e);
    }
  }

  async unregisterForUser(userId: string): Promise<void> {
    try {
      const deviceId = await getDeviceIdAsync();
      await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('device_id', deviceId);
    } catch (e) {
      console.error('Push unregister failed:', e);
    }
  }

  private attachListeners(userId: string) {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    PushNotifications.addListener('registration', async (token) => {
      try {
        const deviceId = await getDeviceIdAsync();
        const platform = nativePlatform();
        await supabase
          .from('push_tokens')
          .upsert(
            {
              user_id: userId,
              device_id: deviceId,
              platform: platform === 'web' ? 'android' : platform,
              token: token.value,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,device_id' }
          );
      } catch (e) {
        console.error('Push token save failed:', e);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err);
    });

    // Foreground: показваме като toast (OS не показва banner когато app-ът е в foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      void notifications.notify({
        title: notification.title || 'Ново съобщение',
        body: notification.body,
      });
    });
  }
}

export const push: PushService = isNative() ? new NativePushService() : new NoopPushService();
