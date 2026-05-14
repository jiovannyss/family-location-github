import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { SharingState } from '@/lib/types';
import { getDeviceId } from '@/services/deviceId';
import { geolocation, type Coords } from '@/services/geolocation';
import { getDeviceInfo } from '@/services/device';
import { isBackgroundGeoSupported, startBackgroundGeolocation, type BackgroundGeoHandle } from '@/services/backgroundGeo';
import { uploadLocationPoint } from '@/services/locationUpload';
import { App as CapacitorApp } from '@capacitor/app';
import { isNative } from '@/services/platform';

export function useSharingState() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const deviceId = getDeviceId();

  // sharing_state for THIS device only
  const { data: sharingState, isLoading } = useQuery({
    queryKey: ['sharing-state', user?.id, deviceId],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('sharing_state')
        .select('*')
        .eq('user_id', user.id)
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) throw error;
      return data as SharingState | null;
    },
    enabled: !!user,
    // Re-check periodically so this device notices when another device took over
    refetchInterval: 30000,
  });

  const toggleSharing = useMutation({
    mutationFn: async (isSharing: boolean) => {
      if (!user) throw new Error('Not authenticated');

      // Upsert this device's sharing row. A DB trigger will deactivate other
      // devices for the same user when is_sharing flips to true.
      const { data, error } = await supabase
        .from('sharing_state')
        .upsert(
          {
            user_id: user.id,
            device_id: deviceId,
            is_sharing: isSharing,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,device_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharing-state'] });
      queryClient.invalidateQueries({ queryKey: ['circle-members'] });
    },
  });

  return {
    sharingState,
    isLoading,
    isSharing: sharingState?.is_sharing ?? false,
    toggleSharing: toggleSharing.mutate,
    isToggling: toggleSharing.isPending,
  };
}

export function useLocationTracking() {
  const { user } = useAuth();
  const { isSharing } = useSharingState();
  const [currentPosition, setCurrentPosition] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Брой последователни грешки — показваме UI чак при ≥2 поредни,
  // за да скрием преходни (например при включване на „Позволи винаги",
  // когато native service-ът се рестартира и една заявка може да fail-не).
  const errorCountRef = useRef(0);
  const reportError = (msg: string) => {
    errorCountRef.current += 1;
    if (errorCountRef.current >= 2) setError(msg);
  };
  const clearError = () => {
    errorCountRef.current = 0;
    setError(null);
  };
  const [permissionState, setPermissionState] = useState<
    'granted' | 'denied' | 'prompt' | 'unknown' | null
  >(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTrackingRef = useRef(false);
  const userIdRef = useRef<string | undefined>(user?.id);
  userIdRef.current = user?.id;
  const deviceId = getDeviceId();
  const uploadCoords = async (coords: Coords) => {
    const uid = userIdRef.current;
    if (!uid) return;

    try {
      await uploadLocationPoint({
        userId: uid,
        deviceId,
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        recordedAt: new Date().toISOString(),
        devicePlatform: getDeviceInfo().platform,
      });
    } catch (err) {
      console.error('Failed to send location:', err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    geolocation.checkPermission().then((p) => {
      if (!cancelled) setPermissionState(p.state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isNative()) return;

    let disposed = false;
    let handle: { remove: () => Promise<void> } | null = null;

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (disposed || !isActive || !isSharing) return;
      void geolocation.checkPermission().then((p) => {
        if (!disposed) setPermissionState(p.state);
      });
      void geolocation.getCurrentPosition()
        .then((coords) => {
          if (disposed) return;
          setCurrentPosition(coords);
          clearError();
          void uploadCoords(coords);
        })
        .catch((err: unknown) => {
          if (!disposed) {
            reportError(err instanceof Error ? err.message : 'Location error');
          }
        });
    }).then((h) => {
      handle = h;
    }).catch(() => {
      /* ignore on unsupported environments */
    });

    return () => {
      disposed = true;
      if (handle) void handle.remove();
    };
  }, [isSharing]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isSharing || !user?.id) {
      isTrackingRef.current = false;
      return;
    }

    if (isTrackingRef.current) return;
    isTrackingRef.current = true;

    let cancelled = false;
    const platform = getDeviceInfo().platform;
    let bgHandle: BackgroundGeoHandle | null = null;

    const doUpdate = async () => {
      if (cancelled) return;
      try {
        const coords = await geolocation.getCurrentPosition();
        if (cancelled) return;
        setCurrentPosition(coords);
        clearError();
        await uploadCoords(coords);
      } catch (err: unknown) {
        if (!cancelled) {
          reportError(err instanceof Error ? err.message : 'Location error');
        }
        console.error('Location update failed:', err);
      }
    };

    // На native: стартираме background tracking — продължава да работи
    // когато app-ът е минимизиран или екранът е заключен.
    if (isBackgroundGeoSupported()) {
      void startBackgroundGeolocation(
        (coords) => {
          if (cancelled) return;
          setCurrentPosition(coords);
          clearError();
          void uploadCoords(coords);
        },
        (err) => {
          if (!cancelled) reportError(err.message);
        }
      ).then((h) => { bgHandle = h; if (cancelled) void h.stop(); });
    }

    doUpdate();
    intervalRef.current = setInterval(doUpdate, isNative() ? 45000 : 120000);

    return () => {
      cancelled = true;
      isTrackingRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (bgHandle) void bgHandle.stop();
    };
  }, [isSharing, user?.id, deviceId]);

  return {
    currentPosition,
    error,
    permissionState,
    isUpdating: false,
  };
}

export function useRealtimeLocations(userIds: string[]) {
  const queryClient = useQueryClient();
  const idsKey = userIds.join(',');

  useEffect(() => {
    if (userIds.length === 0) return;

    const allowed = new Set(userIds);
    // Note: no `filter` here — RLS already restricts which rows we can see.
    // The `in.()` filter on postgres_changes was sometimes silently dropping
    // events, so we filter client-side instead.
    const channel = supabase
      .channel(`location-updates-${idsKey}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'location_points',
        },
        (payload) => {
          const uid = (payload.new as { user_id?: string } | null)?.user_id;
          if (!uid || !allowed.has(uid)) return;
          queryClient.invalidateQueries({ queryKey: ['circle-members'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, queryClient]);
}
