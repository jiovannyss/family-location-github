import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { SharingState, LocationPoint } from '@/lib/types';

export function useSharingState() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: sharingState, isLoading } = useQuery({
    queryKey: ['sharing-state', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('sharing_state')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as SharingState | null;
    },
    enabled: !!user,
  });

  const toggleSharing = useMutation({
    mutationFn: async (isSharing: boolean) => {
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('sharing_state')
        .upsert({
          user_id: user.id,
          is_sharing: isSharing,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharing-state', user?.id] });
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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const updateLocationMutation = useMutation({
    mutationFn: async (position: GeolocationPosition) => {
      if (!user) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('location_points')
        .insert({
          user_id: user.id,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
          recorded_at: new Date().toISOString(),
          device_platform: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
        });

      if (error) throw error;
    },
  });

  const requestPermission = useCallback(async () => {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      setPermissionState(result.state);
      
      result.addEventListener('change', () => {
        setPermissionState(result.state);
      });
      
      return result.state;
    } catch (err) {
      // Permissions API not supported, try to get location directly
      return 'prompt' as PermissionState;
    }
  }, []);

  const getCurrentPosition = useCallback(() => {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentPosition(position);
          setError(null);
          resolve(position);
        },
        (err) => {
          setError(err.message);
          reject(err);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    });
  }, []);

  const startTracking = useCallback(async () => {
    try {
      const position = await getCurrentPosition();
      await updateLocationMutation.mutateAsync(position);
      
      // Update every 2 minutes
      intervalRef.current = setInterval(async () => {
        try {
          const pos = await getCurrentPosition();
          await updateLocationMutation.mutateAsync(pos);
        } catch (err) {
          console.error('Failed to update location:', err);
        }
      }, 120000); // 2 minutes
    } catch (err) {
      console.error('Failed to start tracking:', err);
    }
  }, [getCurrentPosition, updateLocationMutation]);

  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    if (isSharing && user) {
      startTracking();
    } else {
      stopTracking();
    }

    return () => stopTracking();
  }, [isSharing, user, startTracking, stopTracking]);

  return {
    currentPosition,
    error,
    permissionState,
    requestPermission,
    getCurrentPosition,
    isUpdating: updateLocationMutation.isPending,
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
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['circle-members'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userIds.join(','), queryClient]);
}
