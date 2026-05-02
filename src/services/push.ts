/**
 * Push notifications service (native only).
 *
 * Web: no-op (използваме toast + Web Notifications от `notifications.ts`).
 *
 * Native lifecycle:
 *  - Слуша supabase auth state глобално (един път, при import).
 *  - При SIGNED_IN → register + upsert на token за текущия user.
 *  - При SIGNED_OUT / USER_UPDATED със смяна на user → изтрива токена за
 *    предишния user, преди да регистрира новия. Това гарантира, че push-ове
 *    не отиват към грешен акаунт след logout/login в същата сесия.
 *  - Listener-ите на `registration` и `pushNotificationReceived` се връзват
 *    еднократно, но винаги пишат за АКТУАЛНИЯ user (по-долу `currentUserId`).
 */
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { isNative, nativePlatform } from './platform';
import { getDeviceIdAsync } from './deviceId';
import { notifications } from './notifications';

export interface PushService {
  isSupported(): boolean;
  /** Идемпотентен — безопасно е да се извика няколко пъти за същия user. */
  registerForUser(userId: string): Promise<void>;
  /** Изтрива token-а за този user/устройство от backend-а. */
  unregisterForUser(userId: string): Promise<void>;
}

class NoopPushService implements PushService {
  isSupported() { return false; }
  async registerForUser() { /* no-op */ }
  async unregisterForUser() { /* no-op */ }
}

class NativePushService implements PushService {
  private listenersAttached = false;
  private currentUserId: string | null = null;
  /** Последно регистрираният token (за да го изтрием при logout). */
  private currentToken: string | null = null;

  isSupported() { return true; }

  async registerForUser(userId: string): Promise<void> {
    // Ако вече сме регистрирани за същия user — нищо за правене
    if (this.currentUserId === userId) return;

    // Смяна на user → изтрий стария токен от backend-а
    if (this.currentUserId && this.currentUserId !== userId) {
      await this.unregisterForUser(this.currentUserId);
    }

    this.currentUserId = userId;

    try {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== 'granted') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') return;

      this.attachListeners();

      // Ако вече имаме token от предишна регистрация в същата сесия — upsert веднага
      if (this.currentToken) {
        await this.saveToken(userId, this.currentToken);
      }
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
    if (this.currentUserId === userId) {
      this.currentUserId = null;
    }
  }

  private attachListeners() {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    PushNotifications.addListener('registration', async (token) => {
      this.currentToken = token.value;
      const uid = this.currentUserId;
      if (!uid) return; // logout е настъпил между request-а и callback-а
      await this.saveToken(uid, token.value);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      void notifications.notify({
        title: notification.title || 'Ново съобщение',
        body: notification.body,
      });
    });
  }

  private async saveToken(userId: string, token: string) {
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
            token,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,device_id' }
        );
    } catch (e) {
      console.error('Push token save failed:', e);
    }
  }
}

export const push: PushService = isNative() ? new NativePushService() : new NoopPushService();

// ---------- Auth-state глобален hook ----------
// Връзва push lifecycle към login/logout автоматично, така че никой компонент
// не трябва ръчно да вика register/unregister.
if (isNative()) {
  let lastUserId: string | null = null;

  // Init от текущата сесия
  supabase.auth.getSession().then(({ data }) => {
    const uid = data.session?.user?.id ?? null;
    if (uid) {
      lastUserId = uid;
      void push.registerForUser(uid);
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id ?? null;
    if (event === 'SIGNED_OUT' || !uid) {
      if (lastUserId) {
        void push.unregisterForUser(lastUserId);
        lastUserId = null;
      }
      return;
    }
    if (uid !== lastUserId) {
      // Смяна на акаунт (или първоначален login)
      const prev = lastUserId;
      lastUserId = uid;
      if (prev) void push.unregisterForUser(prev);
      void push.registerForUser(uid);
    }
  });
}
