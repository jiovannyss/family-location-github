/**
 * App icon badge (червено балонче с брой непрочетени върху иконата).
 * Native: @capawesome/capacitor-badge → системна badge на иконата.
 * Web: no-op (PWA Badging API е опционално, но не е нужно тук).
 */
import { isNative } from './platform';

let pluginPromise: Promise<any> | null = null;
async function loadPlugin() {
  if (!isNative()) return null;
  if (!pluginPromise) {
    pluginPromise = import('@capawesome/capacitor-badge')
      .then((m) => m.Badge)
      .catch((e) => { console.warn('[badge] plugin import failed', e); return null; });
  }
  return pluginPromise;
}

export async function setAppBadge(count: number): Promise<void> {
  const Badge = await loadPlugin();
  if (!Badge) return;
  try {
    if (count > 0) {
      await Badge.set({ count });
    } else {
      await Badge.clear();
    }
  } catch (e) {
    console.warn('[badge] set failed', e);
  }
}
