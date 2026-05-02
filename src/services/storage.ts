/**
 * Storage abstraction layer.
 *
 * Currently backed by `localStorage` for the web build.
 * For Capacitor, replace the implementation with @capacitor/preferences:
 *   import { Preferences } from '@capacitor/preferences';
 *   await Preferences.set({ key, value });
 *
 * Components and hooks must NEVER touch localStorage directly.
 */

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

class WebLocalStorage implements KeyValueStorage {
  async get(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore (private mode, quota, etc.)
    }
  }
  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export const storage: KeyValueStorage = new WebLocalStorage();
