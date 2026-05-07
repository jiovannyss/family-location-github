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

let registerInvocationSeq = 0;
let activeRegisterInvocationCount = 0;

function nextRegisterInvocationId() {
  registerInvocationSeq += 1;
  return `push-reg-${Date.now()}-${registerInvocationSeq}`;
}

class NativePushService implements PushService {
  isSupported() { return true; }

  async registerForUser(userId: string): Promise<void> {
    const invocationId = nextRegisterInvocationId();
    activeRegisterInvocationCount += 1;

    let registrationHandle: { remove: () => Promise<void> } | null = null;
    let registrationErrorHandle: { remove: () => Promise<void> } | null = null;

    pushDiag.lifecycleStarted = true;
    pushDiag.registerCalled = false;
    pushDiag.registerCallError = null;
    pushDiag.registrationEventFired = false;
    pushDiag.registrationError = null;
    pushDiag.lastDbUpsertError = null;
    pushDiag.earlyReturnReason = null;
    pushDiag.listenersAttached = false;

    pushLog(`${invocationId} ENTER registerForUser`, {
      userId,
      activeInvocationCount: activeRegisterInvocationCount,
      nativeDetected: isNative(),
      platform: nativePlatform(),
      pushEnabled: PUSH_ENABLED,
      disableFlag: import.meta.env.VITE_DISABLE_PUSH ?? null,
    });

    try {
      pushLog(`${invocationId} STEP native platform check`, {
        isNative: isNative(),
        platform: nativePlatform(),
        activeInvocationCount: activeRegisterInvocationCount,
      });
      if (PUSH_DISABLED) {
        pushDiag.earlyReturnReason = 'push disabled by VITE_DISABLE_PUSH or non-native platform';
        pushLog(`${invocationId} RETURN PUSH_DISABLED`, {
          activeInvocationCount: activeRegisterInvocationCount,
          pushEnabled: PUSH_ENABLED,
        });
        return;
      }

      pushLog(`${invocationId} BEFORE await import('@capacitor/push-notifications')`, {
        activeInvocationCount: activeRegisterInvocationCount,
      });
      const importWatchdog = setTimeout(() => {
        pushLog(`${invocationId} WATCHDOG import pending after 10000ms`, {
          activeInvocationCount: activeRegisterInvocationCount,
        });
      }, 10000);
      const module = await import('@capacitor/push-notifications');
      clearTimeout(importWatchdog);
      pushLog(`${invocationId} AFTER await import('@capacitor/push-notifications')`, {
        activeInvocationCount: activeRegisterInvocationCount,
        moduleKeys: module ? Object.keys(module) : null,
        hasPushNotifications: !!module?.PushNotifications,
      });

      const Push = module?.PushNotifications ?? null;
      if (!Push) {
        pushDiag.pluginLoadError = 'PushNotifications export missing';
        pushDiag.earlyReturnReason = 'push plugin export missing';
        pushLog(`${invocationId} RETURN plugin export missing`, {
          activeInvocationCount: activeRegisterInvocationCount,
          moduleKeys: module ? Object.keys(module) : null,
        });
        return;
      }
      pushDiag.pluginLoadError = null;

      let resolveToken!: (token: string) => void;
      let rejectToken!: (error: Error) => void;
      const tokenPromise = new Promise<string>((resolve, reject) => {
        resolveToken = resolve;
        rejectToken = reject;
      });

      pushLog(`${invocationId} BEFORE await Push.addListener('registration')`, {
        activeInvocationCount: activeRegisterInvocationCount,
      });
      const registrationWatchdog = setTimeout(() => {
        pushLog(`${invocationId} WATCHDOG registration listener attach pending after 5000ms`, {
          activeInvocationCount: activeRegisterInvocationCount,
        });
      }, 5000);
      registrationHandle = await Push.addListener('registration', (token) => {
        const tokenValue = token?.value ?? '';
        const tokenLength = tokenValue.length;
        pushDiag.registrationEventFired = true;
        pushDiag.lastTokenLength = tokenLength;
        pushDiag.lastTokenAt = new Date().toISOString();
        pushLog(`${invocationId} EVENT registration success token`, {
          activeInvocationCount: activeRegisterInvocationCount,
          tokenLength,
        });
        resolveToken(tokenValue);
      });
      clearTimeout(registrationWatchdog);
      pushLog(`${invocationId} AFTER await Push.addListener('registration')`, {
        activeInvocationCount: activeRegisterInvocationCount,
      });

      pushLog(`${invocationId} BEFORE await Push.addListener('registrationError')`, {
        activeInvocationCount: activeRegisterInvocationCount,
      });
      const registrationErrorWatchdog = setTimeout(() => {
        pushLog(`${invocationId} WATCHDOG registrationError listener attach pending after 5000ms`, {
          activeInvocationCount: activeRegisterInvocationCount,
        });
      }, 5000);
      registrationErrorHandle = await Push.addListener('registrationError', (err) => {
        const error = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
        pushDiag.registrationError = error.message;
        pushLog(`${invocationId} EVENT registrationError`, {
          activeInvocationCount: activeRegisterInvocationCount,
          error: error.message,
          stack: error.stack || '(no stack)',
        });
        rejectToken(error);
      });
      clearTimeout(registrationErrorWatchdog);
      pushDiag.listenersAttached = true;
      pushLog(`${invocationId} AFTER await Push.addListener('registrationError')`, {
        activeInvocationCount: activeRegisterInvocationCount,
      });

      pushLog(`${invocationId} BEFORE await Push.checkPermissions()`, {
        activeInvocationCount: activeRegisterInvocationCount,
      });
      const checkPermsWatchdog = setTimeout(() => {
        pushLog(`${invocationId} WATCHDOG checkPermissions pending after 5000ms`, {
          activeInvocationCount: activeRegisterInvocationCount,
        });
      }, 5000);
      let perm = await Push.checkPermissions();
      clearTimeout(checkPermsWatchdog);
      pushDiag.lastPermissionState = perm.receive;
      pushLog(`${invocationId} AFTER await Push.checkPermissions()`, {
        activeInvocationCount: activeRegisterInvocationCount,
        receive: perm.receive,
      });

      if (perm.receive !== 'granted') {
        pushLog(`${invocationId} BEFORE await Push.requestPermissions()`, {
          activeInvocationCount: activeRegisterInvocationCount,
          current: perm.receive,
        });
        const requestPermsWatchdog = setTimeout(() => {
          pushLog(`${invocationId} WATCHDOG requestPermissions pending after 5000ms`, {
            activeInvocationCount: activeRegisterInvocationCount,
          });
        }, 5000);
        perm = await Push.requestPermissions();
        clearTimeout(requestPermsWatchdog);
        pushDiag.lastPermissionState = perm.receive;
        pushLog(`${invocationId} AFTER await Push.requestPermissions()`, {
          activeInvocationCount: activeRegisterInvocationCount,
          receive: perm.receive,
        });
      } else {
        pushLog(`${invocationId} SKIP Push.requestPermissions()`, {
          activeInvocationCount: activeRegisterInvocationCount,
          reason: 'permission already granted',
        });
      }

      if (perm.receive !== 'granted') {
        pushDiag.registerCallError = 'permission not granted: ' + perm.receive;
        pushDiag.earlyReturnReason = pushDiag.registerCallError;
        pushLog(`${invocationId} RETURN permission not granted`, {
          activeInvocationCount: activeRegisterInvocationCount,
          receive: perm.receive,
        });
        return;
      }

      pushDiag.registerCalled = true;
      pushLog(`${invocationId} BEFORE await Push.register()`, {
        activeInvocationCount: activeRegisterInvocationCount,
        permission: perm.receive,
      });
      const registerWatchdog = setTimeout(() => {
        pushLog(`${invocationId} WATCHDOG Push.register pending after 10000ms`, {
          activeInvocationCount: activeRegisterInvocationCount,
        });
      }, 10000);
      await Push.register();
      clearTimeout(registerWatchdog);
      pushLog(`${invocationId} AFTER await Push.register()`, {
        activeInvocationCount: activeRegisterInvocationCount,
      });

      pushLog(`${invocationId} BEFORE await registration token`, {
        activeInvocationCount: activeRegisterInvocationCount,
      });
      const tokenWaitWatchdog = setTimeout(() => {
        pushLog(`${invocationId} WATCHDOG registration token pending after 15000ms`, {
          activeInvocationCount: activeRegisterInvocationCount,
        });
      }, 15000);
      const token = await Promise.race([
        tokenPromise,
        new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error('Timed out waiting for registration token')), 15000);
        }),
      ]);
      clearTimeout(tokenWaitWatchdog);
      pushLog(`${invocationId} AFTER await registration token`, {
        activeInvocationCount: activeRegisterInvocationCount,
        tokenLength: token.length,
      });

      pushLog(`${invocationId} BEFORE await saveToken()`, {
        activeInvocationCount: activeRegisterInvocationCount,
        tokenLength: token.length,
      });
      await this.saveToken(userId, token, invocationId);
      pushLog(`${invocationId} AFTER await saveToken()`, {
        activeInvocationCount: activeRegisterInvocationCount,
      });

      pushLog(`${invocationId} RETURN success`, {
        activeInvocationCount: activeRegisterInvocationCount,
      });
    } catch (e) {
      const err = e as Error;
      const message = err?.message || String(e);
      const stack = err?.stack || '(no stack)';
      pushDiag.registerCallError = message;
      pushDiag.earlyReturnReason = message;
      pushLog(`${invocationId} THROW registerForUser`, {
        activeInvocationCount: activeRegisterInvocationCount,
        error: message,
        stack,
      });
      throw e;
    } finally {
      try {
        if (registrationHandle?.remove) {
          pushLog(`${invocationId} BEFORE await registrationHandle.remove()`, {
            activeInvocationCount: activeRegisterInvocationCount,
          });
          await registrationHandle.remove();
          pushLog(`${invocationId} AFTER await registrationHandle.remove()`, {
            activeInvocationCount: activeRegisterInvocationCount,
          });
        }
        if (registrationErrorHandle?.remove) {
          pushLog(`${invocationId} BEFORE await registrationErrorHandle.remove()`, {
            activeInvocationCount: activeRegisterInvocationCount,
          });
          await registrationErrorHandle.remove();
          pushLog(`${invocationId} AFTER await registrationErrorHandle.remove()`, {
            activeInvocationCount: activeRegisterInvocationCount,
          });
        }
      } catch (e) {
        const err = e as Error;
        pushLog(`${invocationId} THROW during finally cleanup`, {
          activeInvocationCount: activeRegisterInvocationCount,
          error: err?.message || String(e),
          stack: err?.stack || '(no stack)',
        });
      } finally {
        pushDiag.listenersAttached = false;
        activeRegisterInvocationCount = Math.max(0, activeRegisterInvocationCount - 1);
        pushLog(`${invocationId} FINALLY registerForUser`, {
          activeInvocationCount: activeRegisterInvocationCount,
          earlyReturnReason: pushDiag.earlyReturnReason,
          registerCallError: pushDiag.registerCallError,
        });
      }
    }
  }

  async forceReregister(userId: string): Promise<void> {
    pushLog('forceReregister delegating to registerForUser', { userId, activeInvocationCount: activeRegisterInvocationCount });
    return this.registerForUser(userId);
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
  }

  private async saveToken(userId: string, token: string, invocationId?: string) {
    try {
      let session = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        pushLog(`${invocationId ?? 'push-save'} BEFORE await supabase.auth.getSession()`, { attempt });
        const { data } = await supabase.auth.getSession();
        pushLog(`${invocationId ?? 'push-save'} AFTER await supabase.auth.getSession()`, {
          attempt,
          hasSession: !!data.session,
        });
        session = data.session;
        if (session) break;
        pushLog(`${invocationId ?? 'push-save'} BEFORE await sleep(300)`, { attempt });
        await sleep(300);
        pushLog(`${invocationId ?? 'push-save'} AFTER await sleep(300)`, { attempt });
      }
      if (!session) {
        const msg = 'no auth session — cannot upsert token';
        console.warn('[push]', msg);
        pushDiag.lastDbUpsertError = msg;
        pushLog(`${invocationId ?? 'push-save'} RETURN no auth session`, { userId });
        return;
      }
      const deviceId = await getDeviceIdAsync();
      const platform = nativePlatform();
      const platformValue = platform === 'web' ? 'android' : platform;
      pushLog(`${invocationId ?? 'push-save'} token upload start`, { userId, deviceId, platform: platformValue, tokenLength: token.length });
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
        pushLog(`${invocationId ?? 'push-save'} token upload error`, { code: error.code ?? null, message: error.message });
        console.error('[push] saveToken DB error', error);
        pushDiag.lastDbUpsertError = `${error.code || ''} ${error.message}`;
      } else {
        pushDiag.lastDbUpsertError = null;
        pushLog(`${invocationId ?? 'push-save'} token upload success`, { userId, deviceId, platform: platformValue });
      }
    } catch (e) {
      const err = e as Error;
      const msg = err?.message || String(e);
      pushLog(`${invocationId ?? 'push-save'} token upload exception`, { error: msg, stack: err?.stack || '(no stack)' });
      console.warn('[push] saveToken failed', e);
      pushDiag.lastDbUpsertError = msg;
      throw e;
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

// ---------- Push startup (linear debug path) ----------
export async function ensurePushLifecycleStarted() {
  if (typeof window === 'undefined') return;

  pushDiag.lifecycleStarted = true;
  pushLog('ensurePushLifecycleStarted ENTER', {
    nativeDetected: isNative(),
    platform: nativePlatform(),
    pushEnabled: PUSH_ENABLED,
    disableFlag: import.meta.env.VITE_DISABLE_PUSH ?? null,
    activeInvocationCount: activeRegisterInvocationCount,
  });

  if (!isNative()) {
    pushDiag.earlyReturnReason = 'ensurePushLifecycleStarted skipped: not native';
    pushLog('ensurePushLifecycleStarted RETURN not native', {
      activeInvocationCount: activeRegisterInvocationCount,
    });
    return;
  }

  if (PUSH_DISABLED) {
    pushDiag.earlyReturnReason = 'ensurePushLifecycleStarted skipped: push disabled';
    pushLog('ensurePushLifecycleStarted RETURN push disabled', {
      activeInvocationCount: activeRegisterInvocationCount,
    });
    return;
  }

  pushLog('ensurePushLifecycleStarted BEFORE await supabase.auth.getSession()', {
    activeInvocationCount: activeRegisterInvocationCount,
  });
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id ?? null;
    pushLog('ensurePushLifecycleStarted AFTER await supabase.auth.getSession()', {
      activeInvocationCount: activeRegisterInvocationCount,
      hasUser: !!uid,
      userId: uid,
    });
    if (!uid) {
      pushDiag.earlyReturnReason = 'ensurePushLifecycleStarted: no authenticated user';
      pushLog('ensurePushLifecycleStarted RETURN no authenticated user', {
        activeInvocationCount: activeRegisterInvocationCount,
      });
      return;
    }

    pushLog('ensurePushLifecycleStarted BEFORE await push.registerForUser()', {
      activeInvocationCount: activeRegisterInvocationCount,
      userId: uid,
    });
    await push.registerForUser(uid);
    pushLog('ensurePushLifecycleStarted AFTER await push.registerForUser()', {
      activeInvocationCount: activeRegisterInvocationCount,
      userId: uid,
    });
  } catch (e) {
    const err = e as Error;
    pushLog('ensurePushLifecycleStarted THROW', {
      activeInvocationCount: activeRegisterInvocationCount,
      error: err?.message || String(e),
      stack: err?.stack || '(no stack)',
    });
  }
}
