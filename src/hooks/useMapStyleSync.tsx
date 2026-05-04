import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import {
  MAP_STYLES,
  MapStyleId,
  getStoredMapStyle,
  setStoredMapStyle,
} from '@/lib/mapStyle';

const VALID_IDS = new Set<string>(Object.keys(MAP_STYLES));

/**
 * Синхронизира избрания map style между:
 *  - localStorage (бърз достъп, работи offline и за неавтентикирани)
 *  - таблицата user_settings в базата (за всички устройства)
 *
 * При логване: чете от БД и налага избора локално.
 * При локална промяна (събитие mapstyle:change): записва в БД.
 */
export function useMapStyleSync() {
  const { user } = useAuth();
  const lastWrittenRef = useRef<string | null>(null);

  // Pull from DB once a user is available
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('map_style')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const remote = data.map_style;
      if (remote && VALID_IDS.has(remote)) {
        const local = getStoredMapStyle();
        if (local !== remote) {
          // Apply remote choice locally without re-triggering a DB write
          lastWrittenRef.current = remote;
          setStoredMapStyle(remote as MapStyleId);
        } else {
          lastWrittenRef.current = remote;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Push local changes to DB
  useEffect(() => {
    if (!user) return;
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent<MapStyleId>).detail;
      if (!detail || !VALID_IDS.has(detail)) return;
      if (lastWrittenRef.current === detail) return;
      lastWrittenRef.current = detail;
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          { user_id: user.id, map_style: detail },
          { onConflict: 'user_id' },
        );
      if (error) {
        // Revert tracker so we'll retry next change
        lastWrittenRef.current = null;
        console.warn('Failed to persist map style:', error);
      }
    };
    window.addEventListener('mapstyle:change', handler);
    return () => window.removeEventListener('mapstyle:change', handler);
  }, [user]);
}
