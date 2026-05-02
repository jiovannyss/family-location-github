import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { SharingState, LocationPoint } from '@/lib/types';
import { getDeviceId } from '@/lib/deviceId';

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
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTrackingRef = useRef(false);
  const userIdRef = useRef<string | undefined>(user?.id);
  userIdRef.current = user?.id;
  const deviceId = getDeviceId();

  useEffect(() => {
    navigator.permissions?.query({ name: 'geolocation' }).then((result) => {
      setPermissionState(result.state);
      result.addEventListener('change', () => setPermissionState(result.state));
    }).catch(() => {});
  }, []);

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

    const getPos = (): Promise<GeolocationPosition> =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

    const sendPos = async (position: GeolocationPosition) => {
      const uid = userIdRef.current;
      if (!uid || cancelled) return;
      const { error: err } = await supabase
        .from('location_points')
        .insert({
          user_id: uid,
          device_id: deviceId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
          recorded_at: new Date().toISOString(),
          device_platform: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
        });
      if (err) console.error('Failed to send location:', err);
    };

    const doUpdate = async () => {
      if (cancelled) return;
      try {
        const pos = await getPos();
        if (cancelled) return;
        setCurrentPosition(pos);
        setError(null);
        await sendPos(pos);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Location error');
        console.error('Location update failed:', err);
      }
    };

    doUpdate();
    intervalRef.current = setInterval(doUpdate, 120000);

    return () => {
      cancelled = true;
      isTrackingRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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

  useEffect(() => {
    if (userIds.length === 0) return;

    const channel = supabase
      .channel('location-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'location_points',
          filter: `user_id=in.(${userIds.join(',')})`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['circle-members'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userIds.join(','), queryClient]);
}
