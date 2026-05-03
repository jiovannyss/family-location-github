/**
 * Auth persistence bridge за Capacitor Android/iOS.
 *
 * Проблем: Supabase клиентът пази сесията в `localStorage`, но Android WebView
 * понякога чисти localStorage между рестарти/update-и → потребителят бива
 * изхвърлян на /auth екрана при всеки старт.
 *
 * Решение: на native платформи синхронизираме всички `sb-*` ключове между
 * localStorage и @capacitor/preferences (постоянно native key/value хранилище).
 *
 *  - При старт: hydrate-ваме записаните стойности от Preferences към localStorage
 *    ПРЕДИ Supabase клиентът да прочете сесията.
 *  - При промяна (login / refresh / logout): mirror-ваме обратно към Preferences.
 *
 * Web: no-op.
 */
import { Preferences } from '@capacitor/preferences';
import { isNative } from '@/services/platform';

const SB_KEY_PREFIX = 'sb-';
const INDEX_KEY = '__sb_keys_index__';

async function listIndexedKeys(): Promise<string[]> {
  try {
    const { value } = await Preferences.get({ key: INDEX_KEY });
    if (!value) return [];
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

async function writeIndex(keys: string[]) {
  try {
    await Preferences.set({ key: INDEX_KEY, value: JSON.stringify(Array.from(new Set(keys))) });
  } catch { /* ignore */ }
}

/** Прехвърля записаната auth сесия от Preferences към localStorage. */
export async function hydrateAuthFromNativeStorage(): Promise<void> {
  if (!isNative()) return;
  try {
    const keys = await listIndexedKeys();
    for (const k of keys) {
      try {
        const { value } = await Preferences.get({ key: k });
        if (value != null && window.localStorage.getItem(k) == null) {
          window.localStorage.setItem(k, value);
        }
      } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn('[authBootstrap] hydrate failed', e);
  }
}

/** Закача listener-и, които mirror-ват промените в localStorage към Preferences. */
export function startAuthPersistenceMirror(): void {
  if (!isNative()) return;
  if (typeof window === 'undefined') return;

  const persist = async (key: string, value: string | null) => {
    try {
      const idx = await listIndexedKeys();
      if (value == null) {
        await Preferences.remove({ key });
        await writeIndex(idx.filter((k) => k !== key));
      } else {
        await Preferences.set({ key, value });
        if (!idx.includes(key)) await writeIndex([...idx, key]);
      }
    } catch (e) {
      console.warn('[authBootstrap] persist failed', e);
    }
  };

  // Препокриваме setItem/removeItem само за `sb-*` ключове.
  const origSet = window.localStorage.setItem.bind(window.localStorage);
  const origRemove = window.localStorage.removeItem.bind(window.localStorage);
  const origClear = window.localStorage.clear.bind(window.localStorage);

  window.localStorage.setItem = (key: string, value: string) => {
    origSet(key, value);
    if (key.startsWith(SB_KEY_PREFIX)) void persist(key, value);
  };
  window.localStorage.removeItem = (key: string) => {
    origRemove(key);
    if (key.startsWith(SB_KEY_PREFIX)) void persist(key, null);
  };
  window.localStorage.clear = () => {
    origClear();
    void (async () => {
      const idx = await listIndexedKeys();
      for (const k of idx) {
        try { await Preferences.remove({ key: k }); } catch { /* ignore */ }
      }
      await writeIndex([]);
    })();
  };

  // Първоначално индексирай каквото вече е в localStorage
  void (async () => {
    try {
      const existing: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(SB_KEY_PREFIX)) {
          existing.push(k);
          const v = window.localStorage.getItem(k);
          if (v != null) await Preferences.set({ key: k, value: v });
        }
      }
      if (existing.length) await writeIndex(existing);
    } catch { /* ignore */ }
  })();
}
