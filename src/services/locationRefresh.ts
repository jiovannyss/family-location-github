/**
 * Изпраща silent push до всички съ-членове в кръговете на текущия user,
 * с искане да върнат свежа локация. Throttle на server (60s/потребител).
 */
import { supabase } from '@/integrations/supabase/client';

let lastCallAt = 0;
const CLIENT_THROTTLE_MS = 30_000;

export async function requestPeerLocationRefresh(opts?: { force?: boolean }): Promise<void> {
  const now = Date.now();
  if (!opts?.force && now - lastCallAt < CLIENT_THROTTLE_MS) return;
  lastCallAt = now;
  try {
    const { data, error } = await supabase.functions.invoke('request-location-refresh', {
      body: {},
    });
    if (error) {
      console.warn('[refresh] invoke error', error);
    } else {
      console.log('[refresh] result', data);
    }
  } catch (e) {
    console.warn('[refresh] failed', e);
  }
}
