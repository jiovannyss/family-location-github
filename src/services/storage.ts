/**
 * Storage abstraction layer.
 *
 * Web: localStorage.
 * Native (Capacitor): @capacitor/preferences (persistent native key/value store).
 *
 * Components and hooks must NEVER touch localStorage directly.
 */
import { Preferences } from '@capacitor/preferences';
import { isNative } from './platform';

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

class WebLocalStorage implements KeyValueStorage {
  async get(key: string): Promise<string | null> {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  async set(key: string, value: string): Promise<void> {
    try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
  }
  async remove(key: string): Promise<void> {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

class NativePreferences implements KeyValueStorage {
  async get(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }
  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}

export const storage: KeyValueStorage = isNative() ? new NativePreferences() : new WebLocalStorage();
