/**
 * Push notifications service (native only).
 *
 * Web: no-op (използваме toast + Web Notifications от `notifications.ts`).
 *
 * Защитна стратегия за Android debug билдове БЕЗ google-services.json:
 *  - Динамичен import на @capacitor/push-notifications, за да не може липсваща
 *    Firebase конфигурация да crash-не bundle-а при стартиране.
 *  - Всички native повиквания са обвити в try/catch + логване.
 *  - VITE_DISABLE_PUSH=true изключва push изцяло (диагностични билдове).
 *  - Auth listener-ът се закача СЛЕД като DOM-ът е mounted (deferred), за да
 *    не се изпълнява през първия render и да не блокира startup.
 */
import { supabase } from '@/integrations/supabase/client';
import { isNative, nativePlatform } from './platform';
import { getDeviceIdAsync } from './deviceId';
import { notifications } from './notifications';

// Push е OPT-IN: на Android `PushNotifications.register()` хвърля native
// Java exception, ако липсва `google-services.json` (FCM config). Този crash
// става в Java thread и НЕ може да се хване от JS try/catch → процесът умира.
// Затова push се активира само когато явно подадеш VITE_ENABLE_PUSH=true
// (след като добавиш google-services.json в android/app/).
const PUSH_ENABLED = import.meta.env.VITE_ENABLE_PUSH === 'true';
const PUSH_DISABLED = !PUSH_ENABLED;

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

// Lazy-loaded native plugin тип
type PushPlugin = typeof import('@capacitor/push-notifications').PushNotifications;
let pushPluginPromise: Promise<PushPlugin | null> | null = null;
async function loadPushPlugin(): Promise<PushPlugin | null> {
  if (!pushPluginPromise) {
    pushPluginPromise = import('@capacitor/push-notifications')
      .then((m) => m.PushNotifications)
      .catch((e) => { console.warn('[push] plugin import failed', e); return null; });
  }
  return pushPluginPromise;
}

class NativePushService implements PushService {
  private listenersAttached = false;
  private currentUserId: string | null = null;
  private currentToken: string | null = null;

  isSupported() { return true; }

  async registerForUser(userId: string): Promise<void> {
    if (PUSH_DISABLED) { console.info('[push] disabled via VITE_DISABLE_PUSH'); return; }
    if (this.currentUserId === userId) return;

    if (this.currentUserId && this.currentUserId !== userId) {
      await this.unregisterForUser(this.currentUserId);
    }
    this.currentUserId = userId;

    const Push = await loadPushPlugin();
    if (!Push) return;

    try {
      let perm = await Push.checkPermissions();
      if (perm.receive !== 'granted') {
        try { perm = await Push.requestPermissions(); }
        catch (e) { console.warn('[push] requestPermissions failed', e); return; }
      }
      if (perm.receive !== 'granted') return;

      await this.attachListeners(Push);

      if (this.currentToken) {
        await this.saveToken(userId, this.currentToken);
      }
      try { await Push.register(); }
      catch (e) { console.warn('[push] register failed (likely missing FCM config)', e); }
    } catch (e) {
      console.warn('[push] registerForUser unexpected error', e);
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
      console.warn('[push] unregister failed', e);
    }
    if (this.currentUserId === userId) this.currentUserId = null;
  }

  private async attachListeners(Push: PushPlugin) {
    if (this.listenersAttached) return;
    this.listenersAttached = true;
    try {
      await Push.addListener('registration', async (token) => {
        this.currentToken = token.value;
        const uid = this.currentUserId;
        if (!uid) return;
        await this.saveToken(uid, token.value);
      });
      await Push.addListener('registrationError', (err) => {
        console.warn('[push] registrationError', err);
      });
      await Push.addListener('pushNotificationReceived', (notification) => {
        void notifications.notify({
          title: notification.title || 'Ново съобщение',
          body: notification.body,
        });
      });
    } catch (e) {
      console.warn('[push] attachListeners failed', e);
    }
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
      console.warn('[push] saveToken failed', e);
    }
  }
}

export const push: PushService =
  isNative() && !PUSH_DISABLED ? new NativePushService() : new NoopPushService();

// ---------- Auth-state глобален hook ----------
// Deferred: изпълнява се след първия render, за да не може ранна грешка
// от push pipeline-а да блокира mount на React дървото.
function initAuthPushBridge() {
  let lastUserId: string | null = null;

  supabase.auth.getSession()
    .then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      if (uid) {
        lastUserId = uid;
        void push.registerForUser(uid);
      }
    })
    .catch((e) => console.warn('[push] getSession failed', e));

  try {
    supabase.auth.onAuthStateChange((event, session) => {
      try {
        const uid = session?.user?.id ?? null;
        if (event === 'SIGNED_OUT' || !uid) {
          if (lastUserId) {
            void push.unregisterForUser(lastUserId);
            lastUserId = null;
          }
          return;
        }
        if (uid !== lastUserId) {
          const prev = lastUserId;
          lastUserId = uid;
          if (prev) void push.unregisterForUser(prev);
          // Малко забавяне → изчакваме session/profile да се стабилизират
          setTimeout(() => { void push.registerForUser(uid); }, 800);
        }
      } catch (e) {
        console.warn('[push] auth listener error', e);
      }
    });
  } catch (e) {
    console.warn('[push] onAuthStateChange subscribe failed', e);
  }
}

if (isNative() && !PUSH_DISABLED) {
  if (typeof window !== 'undefined') {
    // Изчакай първия paint
    setTimeout(initAuthPushBridge, 1500);
  }
}
