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
import { geolocation } from './geolocation';
import { uploadLocationPoint } from './locationUpload';
import { getDeviceId } from './deviceId';
import { getDeviceInfo } from './device';

function pushLog(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`[push-flow] ${message}`, details);
    return;
  }
  console.log(`[push-flow] ${message}`);
}

/**
 * Извикан когато получим silent push с type=location_refresh.
 * Взема свежа локация и я качва — без да показва UI.
 */
async function handleLocationRefreshPush() {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;
    const coords = await geolocation.getCurrentPosition();
    await uploadLocationPoint({
      userId: uid,
      deviceId: getDeviceId(),
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy,
      recordedAt: new Date().toISOString(),
      devicePlatform: getDeviceInfo().platform,
    });
    console.log('[push] location_refresh: uploaded fresh location');
  } catch (e) {
    console.warn('[push] location_refresh failed', e);
  }
}

const PUSH_ENABLED = isNative() && import.meta.env.VITE_DISABLE_PUSH !== 'true';
const PUSH_DISABLED = !PUSH_ENABLED;

// ---------- Live diagnostics (read by PushDiagnostics UI) ----------
export interface PushDiagState {
  lifecycleStarted: boolean;
  nativeDetected: boolean;
  platform: string;
  pushEnabled: boolean;
  earlyReturnReason: string | null;
  registerCalled: boolean;
  registerCallError: string | null;
  registrationEventFired: boolean;
  registrationError: string | null;
  lastTokenLength: number | null;
  lastTokenAt: string | null;
  lastDbUpsertError: string | null;
  lastDbUpsertAt: string | null;
  listenersAttached: boolean;
  lastPermissionState: string | null;
}
export const pushDiag: PushDiagState & { pluginLoadError: string | null } = {
  lifecycleStarted: false,
  nativeDetected: isNative(),
  platform: nativePlatform(),
  pushEnabled: PUSH_ENABLED,
  earlyReturnReason: null,
  registerCalled: false,
  registerCallError: null,
  registrationEventFired: false,
  registrationError: null,
  lastTokenLength: null,
  lastTokenAt: null,
  lastDbUpsertError: null,
  lastDbUpsertAt: null,
  listenersAttached: false,
  lastPermissionState: null,
  pluginLoadError: null,
};

export interface PushService {
  isSupported(): boolean;
  registerForUser(userId: string): Promise<void>;
  unregisterForUser(userId: string): Promise<void>;
  forceReregister(userId: string): Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    pushLog('LPP-A: creating loadPushPlugin promise (first call)');
    pushPluginPromise = (async () => {
      pushLog('LPP-B: entered IIFE, about to dynamic import @capacitor/push-notifications');
      let m: typeof import('@capacitor/push-notifications') | null = null;
      try {
        m = await import('@capacitor/push-notifications');
        pushLog('LPP-C: dynamic import resolved', {
          moduleType: typeof m,
          moduleKeys: m ? Object.keys(m) : null,
          hasPushNotifications: !!(m && (m as any).PushNotifications),
          pushNotificationsType: m ? typeof (m as any).PushNotifications : null,
        });
      } catch (e) {
        const err = e as Error;
        const msg = err?.message || String(e);
        const stack = err?.stack || '(no stack)';
        pushDiag.pluginLoadError = 'dynamic import threw: ' + msg;
        pushLog('LPP-C: dynamic import THREW', { error: msg, stack });
        console.error('[push] dynamic import failed', e);
        return null;
      }

      if (!m?.PushNotifications) {
        pushDiag.pluginLoadError = 'PushNotifications export missing';
        pushLog('LPP-D: PushNotifications export missing', { keys: m ? Object.keys(m) : null });
        return null;
      }
      pushLog('LPP-D: PushNotifications export OK');

      // Sanity probe: checkPermissions
      pushLog('LPP-E: BEFORE sanity checkPermissions probe');
      try {
        const probe = await m.PushNotifications.checkPermissions();
        pushLog('LPP-E: AFTER sanity checkPermissions probe', { receive: probe?.receive ?? null });
      } catch (e) {
        const err = e as Error;
        const msg = err?.message || String(e);
        const stack = err?.stack || '(no stack)';
        pushDiag.pluginLoadError = 'checkPermissions probe failed: ' + msg;
        pushLog('LPP-E: sanity checkPermissions THREW (continuing anyway)', { error: msg, stack });
      }

      pushDiag.pluginLoadError = null;
      pushLog('LPP-F: returning PushNotifications plugin instance', {
        type: typeof m.PushNotifications,
        methods: Object.keys(m.PushNotifications || {}),
      });
      const pluginRef = m.PushNotifications;
      pushLog('LPP-F2: pluginRef captured, about to return from IIFE', { hasRef: !!pluginRef });
      return pluginRef;
    })().then((v) => {
      pushLog('LPP-Y: IIFE .then fired (promise resolved)', { hasValue: !!v });
      return v;
    }).catch((e) => {
      const err = e as Error;
      const msg = err?.message || String(e);
      const stack = err?.stack || '(no stack)';
      pushDiag.pluginLoadError = 'loadPushPlugin outer catch: ' + msg;
      pushLog('LPP-X: outer promise rejection', { error: msg, stack });
      return null;
    });
  } else {
    pushLog('LPP-A: reusing existing loadPushPlugin promise');
  }
  const result = await pushPluginPromise;
  pushLog('LPP-Z: loadPushPlugin awaited', { hasResult: !!result });
  return result;
}

class NativePushService implements PushService {
  private listenersAttached = false;
  private currentUserId: string | null = null;
  private currentToken: string | null = null;

  isSupported() { return true; }

  async registerForUser(userId: string): Promise<void> {
    pushLog('STEP 1: registerForUser called', {
      userId,
      nativeDetected: isNative(),
      platform: nativePlatform(),
      pushEnabled: PUSH_ENABLED,
      disableFlag: import.meta.env.VITE_DISABLE_PUSH ?? null,
    });

    pushLog('STEP 2: native platform check', { isNative: isNative(), platform: nativePlatform() });
    if (PUSH_DISABLED) {
      pushDiag.earlyReturnReason = 'push disabled by VITE_DISABLE_PUSH or non-native platform';
      pushLog('EARLY RETURN @ STEP 2: PUSH_DISABLED', { pushEnabled: PUSH_ENABLED });
      return;
    }

    pushLog('STEP 3: storing currentUserId', { userId });
    this.currentUserId = userId;

    pushLog('STEP 4: BEFORE loadPushPlugin()');
    let Push: PushPlugin | null = null;
    try {
      const watchdogs = [2000, 5000, 10000].map((ms) =>
        setTimeout(() => pushLog(`STEP 4: WATCHDOG loadPushPlugin pending after ${ms}ms`), ms)
      );
      const loadStart = Date.now();
      pushLog('STEP 4.1: awaiting loadPushPlugin()...');
      Push = await loadPushPlugin();
      watchdogs.forEach(clearTimeout);
      pushLog('STEP 4.2: loadPushPlugin() resolved', {
        elapsedMs: Date.now() - loadStart,
        loaded: !!Push,
        pushType: typeof Push,
        pushKeys: Push ? Object.keys(Push as any) : null,
        pluginLoadError: pushDiag.pluginLoadError,
      });
    } catch (e) {
      const err = e as Error;
      pushDiag.earlyReturnReason = 'loadPushPlugin threw: ' + err?.message;
      pushLog('EARLY RETURN @ STEP 4: loadPushPlugin threw', {
        error: err?.message,
        stack: err?.stack || '(no stack)',
      });
      return;
    }
    pushLog('STEP 4.3: post-await Push variable check', { hasPush: !!Push });
    if (!Push) {
      pushDiag.earlyReturnReason = 'push plugin not loaded';
      pushLog('EARLY RETURN @ STEP 4: plugin null', { pluginLoadError: pushDiag.pluginLoadError });
      return;
    }
    pushLog('STEP 4.4: Push non-null, entering main try block');

    try {
      pushLog('STEP 4.5: verifying checkPermissions method exists');
      const checkPermsType = typeof (Push as any).checkPermissions;
      pushLog('STEP 4.6: checkPermissions method type', { type: checkPermsType });
      if (checkPermsType !== 'function') {
        pushDiag.earlyReturnReason = 'checkPermissions is not a function: ' + checkPermsType;
        pushLog('EARLY RETURN @ STEP 4.6: checkPermissions missing', { type: checkPermsType });
        return;
      }
      pushLog('STEP 5: BEFORE Push.checkPermissions()');
      let perm: { receive: string };
      try {
        const cpStart = Date.now();
        const cpWatchdog = setTimeout(
          () => pushLog('STEP 5: WATCHDOG checkPermissions pending >3s'),
          3000
        );
        perm = await Push.checkPermissions();
        clearTimeout(cpWatchdog);
        pushLog('STEP 5: AFTER Push.checkPermissions()', {
          receive: perm?.receive,
          elapsedMs: Date.now() - cpStart,
        });
      } catch (e) {
        const err = e as Error;
        pushDiag.registerCallError = 'checkPermissions threw: ' + err?.message;
        pushDiag.earlyReturnReason = pushDiag.registerCallError;
        pushLog('EARLY RETURN @ STEP 5: checkPermissions threw', { error: err?.message, stack: err?.stack || '(no stack)' });
        return;
      }
      pushDiag.lastPermissionState = perm.receive;

      if (perm.receive !== 'granted') {
        pushLog('STEP 6: BEFORE Push.requestPermissions()', { current: perm.receive });
        try {
          perm = await Push.requestPermissions();
          pushDiag.lastPermissionState = perm.receive;
          pushLog('STEP 6: AFTER Push.requestPermissions()', { receive: perm.receive });
        } catch (e) {
          const msg = (e as Error).message;
          pushDiag.registerCallError = 'requestPermissions failed: ' + msg;
          pushDiag.earlyReturnReason = pushDiag.registerCallError;
          pushLog('EARLY RETURN @ STEP 6: requestPermissions threw', { error: msg });
          return;
        }
      } else {
        pushLog('STEP 6: skipped — permission already granted');
      }

      if (perm.receive !== 'granted') {
        pushDiag.registerCallError = 'permission not granted: ' + perm.receive;
        pushDiag.earlyReturnReason = pushDiag.registerCallError;
        pushLog('EARLY RETURN @ STEP 7: permission not granted after request', { receive: perm.receive });
        return;
      }
      pushLog('STEP 7: permission granted confirmed');

      pushLog('STEP 8: BEFORE attachListeners()');
      try {
        await this.attachListeners(Push);
        pushLog('STEP 8: AFTER attachListeners()', { listenersAttached: this.listenersAttached });
      } catch (e) {
        const msg = (e as Error).message;
        pushDiag.earlyReturnReason = 'attachListeners threw: ' + msg;
        pushLog('EARLY RETURN @ STEP 8: attachListeners threw', { error: msg });
        return;
      }

      if (this.currentToken) {
        pushLog('STEP 9: cached token present, re-saving', { tokenLength: this.currentToken.length });
        try {
          await this.saveToken(userId, this.currentToken);
          pushLog('STEP 9: cached token re-saved');
        } catch (e) {
          pushLog('STEP 9: cached token save failed (continuing)', { error: (e as Error).message });
        }
      } else {
        pushLog('STEP 9: no cached token, proceed to register');
      }

      try {
        pushDiag.earlyReturnReason = null;
        pushLog('STEP 10: BEFORE PushNotifications.register()', {
          userId,
          listenersAttached: this.listenersAttached,
          permission: pushDiag.lastPermissionState,
        });
        await Push.register();
        pushDiag.registerCalled = true;
        pushDiag.registerCallError = null;
        pushLog('STEP 10: AFTER PushNotifications.register() — awaiting registration event');
      } catch (e) {
        const msg = (e as Error).message;
        pushDiag.registerCallError = msg;
        pushDiag.earlyReturnReason = msg;
        pushLog('STEP 10: register() threw', { error: msg });
      }
    } catch (e) {
      const msg = (e as Error).message;
      pushDiag.registerCallError = 'unexpected: ' + msg;
      pushDiag.earlyReturnReason = pushDiag.registerCallError;
      pushLog('UNEXPECTED outer catch in registerForUser', { error: msg });
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
      pushDiag.earlyReturnReason = pushDiag.registerCallError;
      pushLog('forceReregister EARLY RETURN: plugin not loaded', { pluginLoadError: pushDiag.pluginLoadError });
      console.warn('[push] forceReregister: plugin not loaded');
      return;
    }
    // Make sure permission is granted before register()
    try {
      let perm = await Push.checkPermissions();
      pushDiag.lastPermissionState = perm.receive;
      if (perm.receive !== 'granted') {
        try {
          perm = await Push.requestPermissions();
          pushDiag.lastPermissionState = perm.receive;
        } catch (e) {
          const msg = (e as Error).message;
          pushDiag.registerCallError = 'requestPermissions failed: ' + msg;
          pushDiag.earlyReturnReason = pushDiag.registerCallError;
          pushLog('forceReregister EARLY RETURN: requestPermissions failed', { error: msg });
          return;
        }
      }
      if (perm.receive !== 'granted') {
        pushDiag.registerCallError = 'permission not granted: ' + perm.receive;
        pushDiag.earlyReturnReason = pushDiag.registerCallError;
        pushLog('forceReregister EARLY RETURN: permission not granted', { receive: perm.receive });
        return;
      }
    } catch (e) {
      pushDiag.registerCallError = 'perm check failed: ' + (e as Error).message;
      pushDiag.earlyReturnReason = pushDiag.registerCallError;
      pushLog('forceReregister EARLY RETURN: permission check failed', { error: (e as Error).message });
      return;
    }
    await this.attachListeners(Push);
    try {
      pushDiag.registerCalled = true;
      await Push.register();
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
        pushLog('registration success token received', { tokenLength: len });
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
        pushLog('registrationError listener fired', { error: msg });
        console.warn('[push] registrationError', err);
        pushDiag.registrationError = msg;
      });
      await Push.addListener('pushNotificationReceived', (notification) => {
        console.log('[push] notification received in foreground', notification);
        // Silent location refresh push: data-only, събужда устройството за да
        // прати свежи координати без UI на потребителя.
        const data = notification.data || {};
        if (data.type === 'location_refresh') {
          void handleLocationRefreshPush();
          return;
        }
        void notifications.notify({
          title: notification.title || 'Ново съобщение',
          body: notification.body,
        });
        // Ако payload-ът носи unread_count → синхронизирай badge-а веднага,
        // за да не чакаме realtime + useMessages да обновят бройката.
        const raw = data.unread_count;
        const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
        if (Number.isFinite(n) && n >= 0) {
          void import('./appBadge').then(({ setAppBadge }) => setAppBadge(n)).catch(() => {});
        }
      });
      // pushNotificationActionPerformed → когато iOS събуди приложението от
      // silent push, понякога идва тук вместо в foreground listener-а.
      await Push.addListener('pushNotificationActionPerformed', (action) => {
        const data = action?.notification?.data || {};
        if (data.type === 'location_refresh') {
          void handleLocationRefreshPush();
        }
      });
    } catch (e) {
      pushDiag.earlyReturnReason = 'attachListeners failed: ' + (e as Error).message;
      pushLog('attachListeners failed', { error: (e as Error).message });
      console.warn('[push] attachListeners failed', e);
      this.listenersAttached = false;
      pushDiag.listenersAttached = false;
    }
  }

  private async saveToken(userId: string, token: string) {
    try {
      // Ensure session is present (RLS needs auth.uid()).
      // На Android registration event може да дойде секунди преди auth state да се стабилизира.
      let session = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (session) break;
        await sleep(300);
      }
      if (!session) {
        const msg = 'no auth session — cannot upsert token';
        console.warn('[push]', msg);
        pushDiag.lastDbUpsertError = msg;
        return;
      }
      const deviceId = await getDeviceIdAsync();
      const platform = nativePlatform();
      const platformValue = platform === 'web' ? 'android' : platform;
      pushLog('token upload start', { userId, deviceId, platform: platformValue, tokenLength: token.length });
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
        pushLog('token upload error', { code: error.code ?? null, message: error.message });
        console.error('[push] saveToken DB error', error);
        pushDiag.lastDbUpsertError = `${error.code || ''} ${error.message}`;
      } else {
        pushDiag.lastDbUpsertError = null;
        pushLog('token upload success', { userId, deviceId, platform: platformValue });
        console.log('[push] saveToken OK');
      }
    } catch (e) {
      const msg = (e as Error).message;
      pushLog('token upload exception', { error: msg });
      console.warn('[push] saveToken failed', e);
      pushDiag.lastDbUpsertError = msg;
    }
  }
}

const noopPushService = new NoopPushService();
const nativePushService = new NativePushService();

function getPushService(): PushService {
  return isNative() && !PUSH_DISABLED ? nativePushService : noopPushService;
}

export const push: PushService = {
  isSupported() {
    return getPushService().isSupported();
  },
  registerForUser(userId: string) {
    return getPushService().registerForUser(userId);
  },
  unregisterForUser(userId: string) {
    return getPushService().unregisterForUser(userId);
  },
  forceReregister(userId: string) {
    return getPushService().forceReregister(userId);
  },
};

// ---------- Auth-state глобален hook ----------
// Deferred: изпълнява се след първия render, за да не може ранна грешка
// от push pipeline-а да блокира mount на React дървото.
let authPushBridgeInitialized = false;

function initAuthPushBridge() {
  if (authPushBridgeInitialized) return;
  authPushBridgeInitialized = true;
  pushDiag.lifecycleStarted = true;
  let lastUserId: string | null = null;

  pushLog('initAuthPushBridge start', {
    nativeDetected: isNative(),
    platform: nativePlatform(),
    pushEnabled: PUSH_ENABLED,
  });

  supabase.auth.getSession()
    .then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      pushLog('initial auth session resolved', { hasUser: !!uid, userId: uid });
      if (uid) {
        lastUserId = uid;
        void push.registerForUser(uid);
      }
    })
    .catch((e) => console.warn('[push] getSession failed', e));

  try {
    supabase.auth.onAuthStateChange((event, session) => {
      pushLog('auth state change observed', { event, hasUser: !!session?.user?.id });
      console.log('[push] auth state change', event, !!session?.user?.id);
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

export function ensurePushLifecycleStarted() {
  if (typeof window === 'undefined') return;
  pushLog('ensurePushLifecycleStarted called', {
    nativeDetected: isNative(),
    platform: nativePlatform(),
    pushEnabled: PUSH_ENABLED,
    disableFlag: import.meta.env.VITE_DISABLE_PUSH ?? null,
  });
  if (!isNative()) {
    pushDiag.earlyReturnReason = 'ensurePushLifecycleStarted skipped: not native';
    pushLog('EARLY RETURN: ensurePushLifecycleStarted skipped because platform is not native');
    return;
  }
  if (PUSH_DISABLED) {
    pushDiag.earlyReturnReason = 'ensurePushLifecycleStarted skipped: push disabled';
    pushLog('EARLY RETURN: ensurePushLifecycleStarted skipped because push is disabled');
    return;
  }
  initAuthPushBridge();
}

if (typeof window !== 'undefined') {
  // Backup auto-start за случаите, в които модулът е зареден преди React mount.
  const scheduleStart = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (callback: () => void) => window.setTimeout(callback, 0);

  scheduleStart(() => {
    ensurePushLifecycleStarted();
  });
}
