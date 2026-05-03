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

// ---------- Live diagnostics (read by PushDiagnostics UI) ----------
export interface PushDiagState {
  registerCalled: boolean;
  registerCallError: string | null;
  registrationEventFired: boolean;
  registrationError: string | null;
  lastTokenLength: number | null;
  lastTokenAt: string | null;
  lastDbUpsertError: string | null;
  lastDbUpsertAt: string | null;
  listenersAttached: boolean;
}
export const pushDiag: PushDiagState & { pluginLoadError: string | null } = {
  registerCalled: false,
  registerCallError: null,
  registrationEventFired: false,
  registrationError: null,
  lastTokenLength: null,
  lastTokenAt: null,
  lastDbUpsertError: null,
  lastDbUpsertAt: null,
  listenersAttached: false,
  pluginLoadError: null,
};

export interface PushService {
  isSupported(): boolean;
  registerForUser(userId: string): Promise<void>;
  unregisterForUser(userId: string): Promise<void>;
  forceReregister(userId: string): Promise<void>;
}

class NoopPushService implements PushService {
  isSupported() { return false; }
  async registerForUser() { /* no-op */ }
  async unregisterForUser() { /* no-op */ }
  async forceReregister() { /* no-op */ }
}

// Lazy-loaded native plugin тип
type PushPlugin = typeof import('@capacitor/push-notifications').PushNotifications;
let pushPluginPromise: Promise<PushPlugin | null> | null = null;
async function loadPushPlugin(): Promise<PushPlugin | null> {
  if (!pushPluginPromise) {
    pushPluginPromise = (async () => {
      try {
        const m = await import('@capacitor/push-notifications');
        if (!m?.PushNotifications) {
          pushDiag.pluginLoadError = 'PushNotifications export missing';
          console.warn('[push] PushNotifications export missing on module', Object.keys(m || {}));
          return null;
        }
        // Sanity: проверка че plugin-ът е реално регистриран в native bridge
        try {
          await m.PushNotifications.checkPermissions();
        } catch (e) {
          const msg = (e as Error).message || String(e);
          pushDiag.pluginLoadError = 'checkPermissions failed: ' + msg;
          console.warn('[push] checkPermissions probe failed', e);
          // Връщаме plugin-а въпреки това — register() може да даде по-точна грешка
        }
        pushDiag.pluginLoadError = null;
        return m.PushNotifications;
      } catch (e) {
        const msg = (e as Error).message || String(e);
        console.warn('[push] plugin import failed', e);
        pushDiag.pluginLoadError = msg;
        return null;
      }
    })();
  }
  return pushPluginPromise;
}

class NativePushService implements PushService {
  private listenersAttached = false;
  private currentUserId: string | null = null;
  private currentToken: string | null = null;

  isSupported() { return true; }

  async registerForUser(userId: string): Promise<void> {
    console.log('[push] registerForUser called', { userId, PUSH_ENABLED });
    if (PUSH_DISABLED) { console.info('[push] disabled — VITE_ENABLE_PUSH != true'); return; }
    this.currentUserId = userId;

    const Push = await loadPushPlugin();
    if (!Push) { console.warn('[push] plugin not loaded'); return; }

    try {
      let perm = await Push.checkPermissions();
      console.log('[push] checkPermissions →', perm);
      if (perm.receive !== 'granted') {
        try {
          perm = await Push.requestPermissions();
          console.log('[push] requestPermissions →', perm);
        } catch (e) {
          console.warn('[push] requestPermissions failed', e);
          pushDiag.registerCallError = 'requestPermissions failed: ' + (e as Error).message;
          return;
        }
      }
      if (perm.receive !== 'granted') {
        console.warn('[push] permission not granted, abort');
        pushDiag.registerCallError = 'permission not granted: ' + perm.receive;
        return;
      }

      // Attach listeners BEFORE register()
      await this.attachListeners(Push);

      if (this.currentToken) {
        console.log('[push] reusing cached token, re-saving');
        await this.saveToken(userId, this.currentToken);
      }

      try {
        await Push.register();
        pushDiag.registerCalled = true;
        pushDiag.registerCallError = null;
        console.log('[push] register() ok — waiting for registration event');
      } catch (e) {
        const msg = (e as Error).message;
        pushDiag.registerCallError = msg;
        console.warn('[push] register failed', e);
      }
    } catch (e) {
      pushDiag.registerCallError = 'unexpected: ' + (e as Error).message;
      console.warn('[push] registerForUser unexpected error', e);
    }
  }

  async forceReregister(userId: string): Promise<void> {
    console.log('[push] forceReregister', userId);
    this.currentUserId = userId;
    this.currentToken = null;
    pushDiag.registerCalled = false;
    pushDiag.registrationEventFired = false;
    pushDiag.registrationError = null;
    pushDiag.lastDbUpsertError = null;
    const Push = await loadPushPlugin();
    if (!Push) {
      pushDiag.registerCallError = 'plugin not loaded: ' + (pushDiag.pluginLoadError ?? 'unknown');
      console.warn('[push] forceReregister: plugin not loaded');
      return;
    }
    // Make sure permission is granted before register()
    try {
      let perm = await Push.checkPermissions();
      if (perm.receive !== 'granted') {
        perm = await Push.requestPermissions();
      }
      if (perm.receive !== 'granted') {
        pushDiag.registerCallError = 'permission not granted: ' + perm.receive;
        return;
      }
    } catch (e) {
      pushDiag.registerCallError = 'perm check failed: ' + (e as Error).message;
      return;
    }
    await this.attachListeners(Push);
    try {
      await Push.register();
      pushDiag.registerCalled = true;
      console.log('[push] forceReregister: register() ok');
    } catch (e) {
      pushDiag.registerCallError = (e as Error).message;
      console.warn('[push] forceReregister failed', e);
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
    pushDiag.listenersAttached = true;
    try {
      await Push.addListener('registration', async (token) => {
        const len = token?.value?.length ?? 0;
        console.log('[push] registration event — token len:', len);
        pushDiag.registrationEventFired = true;
        pushDiag.lastTokenLength = len;
        pushDiag.lastTokenAt = new Date().toISOString();
        this.currentToken = token.value;
        const uid = this.currentUserId;
        if (!uid) {
          console.warn('[push] got token but no currentUserId — will retry on auth');
          return;
        }
        await this.saveToken(uid, token.value);
      });
      await Push.addListener('registrationError', (err) => {
        const msg = JSON.stringify(err);
        console.warn('[push] registrationError', err);
        pushDiag.registrationError = msg;
      });
      await Push.addListener('pushNotificationReceived', (notification) => {
        console.log('[push] notification received in foreground', notification);
        void notifications.notify({
          title: notification.title || 'Ново съобщение',
          body: notification.body,
        });
      });
    } catch (e) {
      console.warn('[push] attachListeners failed', e);
      this.listenersAttached = false;
      pushDiag.listenersAttached = false;
    }
  }

  private async saveToken(userId: string, token: string) {
    try {
      // Ensure session is present (RLS needs auth.uid())
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const msg = 'no auth session — cannot upsert token';
        console.warn('[push]', msg);
        pushDiag.lastDbUpsertError = msg;
        return;
      }
      const deviceId = await getDeviceIdAsync();
      const platform = nativePlatform();
      const platformValue = platform === 'web' ? 'android' : platform;
      console.log('[push] saveToken upsert', { userId, deviceId, platform: platformValue, tokenLen: token.length });
      const { error } = await supabase
        .from('push_tokens')
        .upsert(
          {
            user_id: userId,
            device_id: deviceId,
            platform: platformValue,
            token,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,device_id' }
        );
      pushDiag.lastDbUpsertAt = new Date().toISOString();
      if (error) {
        console.error('[push] saveToken DB error', error);
        pushDiag.lastDbUpsertError = `${error.code || ''} ${error.message}`;
      } else {
        pushDiag.lastDbUpsertError = null;
        console.log('[push] saveToken OK');
      }
    } catch (e) {
      const msg = (e as Error).message;
      console.warn('[push] saveToken failed', e);
      pushDiag.lastDbUpsertError = msg;
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
