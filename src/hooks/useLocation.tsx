import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { SharingState } from '@/lib/types';
import { getDeviceId, getDeviceIdAsync } from '@/services/deviceId';
import { geolocation, type Coords } from '@/services/geolocation';
import { getDeviceInfo } from '@/services/device';
import { isBackgroundGeoSupported, startBackgroundGeolocation, type BackgroundGeoHandle } from '@/services/backgroundGeo';
import {
  checkBackgroundPermission,
  startNativeBackgroundMonitoring,
  stopNativeBackgroundMonitoring,
} from '@/services/backgroundLocationPermission';
import { uploadLocationPoint } from '@/services/locationUpload';
import { App as CapacitorApp } from '@capacitor/app';
import { isNative, nativePlatform } from '@/services/platform';

function useResolvedDeviceId() {
  const [deviceId, setDeviceId] = useState(() => getDeviceId());

  useEffect(() => {
    let disposed = false;
    void getDeviceIdAsync()
      .then((resolved) => {
        if (!disposed && resolved && resolved !== deviceId) {
          setDeviceId(resolved);
        }
      })
      .catch(() => {
        /* ignore */
      });

    return () => {
      disposed = true;
    };
  }, [deviceId]);

  return deviceId;
}

export function useSharingState() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const deviceId = useResolvedDeviceId();

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
    refetchInterval: 30000,
  });

  const toggleSharing = useMutation({
    mutationFn: async (isSharing: boolean) => {
      if (!user) throw new Error('Not authenticated');

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
    deviceId,
  };
}

type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown' | null;
type IosPermissionState = 'denied' | 'whileUsing' | 'always' | 'unknown' | null;
type NativeBridgeStatus = 'idle' | 'started' | 'permission_missing' | 'not_available' | 'error';

interface LocationTrackingDiagnostics {
  userId: string | null;
  deviceId: string;
  isSharing: boolean;
  isForeground: boolean;
  iosPermission: IosPermissionState;
  iosRawStatus: string | null;
  jsForegroundWatcherActive: boolean;
  nativeBridgeStarted: boolean;
  nativeBridgeStatus: NativeBridgeStatus;
  nativeBridgeMessage: string | null;
  lastSuccessfulUploadAt: string | null;
  lastUploadError: string | null;
  lastForegroundFixAt: string | null;
}

interface LocationTrackingContextValue {
  currentPosition: Coords | null;
  error: string | null;
  permissionState: PermissionState;
  isUpdating: boolean;
  diagnostics: LocationTrackingDiagnostics;
  refreshNow: () => Promise<void>;
}

const LocationTrackingContext = createContext<LocationTrackingContextValue | undefined>(undefined);

function mapIosPermission(rawStatus?: string | null): IosPermissionState {
  if (!rawStatus) return 'unknown';
  if (rawStatus === 'authorizedAlways') return 'always';
  if (rawStatus === 'authorizedWhenInUse') return 'whileUsing';
  if (rawStatus === 'denied' || rawStatus === 'restricted') return 'denied';
  return 'unknown';
}

function useProvideLocationTracking(): LocationTrackingContextValue {
  const { user } = useAuth();
  const { isSharing, deviceId } = useSharingState();
  const [currentPosition, setCurrentPosition] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [appIsActive, setAppIsActive] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  const [diagnostics, setDiagnostics] = useState<LocationTrackingDiagnostics>({
    userId: user?.id ?? null,
    deviceId,
    isSharing: false,
    isForeground: true,
    iosPermission: null,
    iosRawStatus: null,
    jsForegroundWatcherActive: false,
    nativeBridgeStarted: false,
    nativeBridgeStatus: 'idle',
    nativeBridgeMessage: null,
    lastSuccessfulUploadAt: null,
    lastUploadError: null,
    lastForegroundFixAt: null,
  });

  const errorCountRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchCleanupRef = useRef<(() => void) | null>(null);
  const bgHandleRef = useRef<BackgroundGeoHandle | null>(null);
  const lastWatchUploadAtRef = useRef(0);
  const userIdRef = useRef<string | undefined>(user?.id);
  userIdRef.current = user?.id;

  const isIosNative = isNative() && nativePlatform() === 'ios';
  const isForeground = appIsActive && documentVisible;

  useEffect(() => {
    setDiagnostics((prev) => ({
      ...prev,
      userId: user?.id ?? null,
      deviceId,
      isSharing,
      isForeground,
    }));
  }, [deviceId, isForeground, isSharing, user?.id]);

  const reportError = useCallback((message: string) => {
    errorCountRef.current += 1;
    if (errorCountRef.current >= 2) {
      setError(message);
    }
  }, []);

  const clearError = useCallback(() => {
    errorCountRef.current = 0;
    setError(null);
  }, []);

  const refreshForegroundPermission = useCallback(async () => {
    try {
      const permission = await geolocation.checkPermission();
      setPermissionState(permission.state);
    } catch {
      setPermissionState('unknown');
    }
  }, []);

  const refreshIosPermission = useCallback(async () => {
    if (!isIosNative) {
      setDiagnostics((prev) => ({
        ...prev,
        iosPermission: null,
        iosRawStatus: null,
      }));
      return null;
    }

    try {
      const status = await checkBackgroundPermission();
      setDiagnostics((prev) => ({
        ...prev,
        iosPermission: mapIosPermission(status.rawStatus),
        iosRawStatus: status.rawStatus ?? null,
      }));
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неуспешна проверка на iOS permission';
      setDiagnostics((prev) => ({
        ...prev,
        iosPermission: 'unknown',
        iosRawStatus: message,
      }));
      return null;
    }
  }, [isIosNative]);

  const uploadCoords = useCallback(async (coords: Coords, trigger: string) => {
    const uid = userIdRef.current;
    if (!uid) return false;

    try {
      await uploadLocationPoint({
        userId: uid,
        deviceId,
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        recordedAt: new Date(coords.timestamp || Date.now()).toISOString(),
        devicePlatform: getDeviceInfo().platform,
      });

      const uploadedAt = new Date().toISOString();
      setDiagnostics((prev) => ({
        ...prev,
        lastSuccessfulUploadAt: uploadedAt,
        lastUploadError: null,
      }));
      console.info('[location] upload success', { trigger, deviceId, userId: uid, uploadedAt });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Location upload failed';
      setDiagnostics((prev) => ({
        ...prev,
        lastUploadError: message,
      }));
      console.error('[location] upload failed', { trigger, deviceId, userId: uid, message, error: err });
      return false;
    }
  }, [deviceId]);

  const ensureNativeBridge = useCallback(async () => {
    if (!isIosNative || !isSharing) {
      setDiagnostics((prev) => ({
        ...prev,
        nativeBridgeStarted: false,
        nativeBridgeStatus: 'idle',
        nativeBridgeMessage: null,
      }));
      return;
    }

    const result = await startNativeBackgroundMonitoring();
    const status: NativeBridgeStatus = result.started
      ? 'started'
      : result.error
        ? 'error'
        : result.bridgeAvailable
          ? 'permission_missing'
          : 'not_available';

    setDiagnostics((prev) => ({
      ...prev,
      nativeBridgeStarted: result.started,
      nativeBridgeStatus: status,
      nativeBridgeMessage: result.error ?? result.reason ?? result.rawStatus ?? null,
      iosPermission: result.rawStatus ? mapIosPermission(result.rawStatus) : prev.iosPermission,
      iosRawStatus: result.rawStatus ?? prev.iosRawStatus,
    }));

    if (!result.started) {
      console.warn('[location] iOS native bridge not started', result);
    } else {
      console.info('[location] iOS native bridge started', result);
    }
  }, [isIosNative, isSharing]);

  const refreshNow = useCallback(async () => {
    if (!isSharing || !userIdRef.current) return;

    setIsUpdating(true);
    try {
      const coords = await geolocation.getCurrentPosition({ timeoutMs: 12000, enableHighAccuracy: true });
      setCurrentPosition(coords);
      setDiagnostics((prev) => ({
        ...prev,
        lastForegroundFixAt: new Date(coords.timestamp || Date.now()).toISOString(),
      }));
      clearError();
      await uploadCoords(coords, 'manual');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Location error';
      reportError(message);
      setDiagnostics((prev) => ({
        ...prev,
        lastUploadError: message,
      }));
      console.error('[location] manual refresh failed', err);
    } finally {
      setIsUpdating(false);
    }
  }, [clearError, isSharing, reportError, uploadCoords]);

  useEffect(() => {
    void refreshForegroundPermission();
    void refreshIosPermission();

    let disposed = false;
    let appListener: { remove: () => Promise<void> } | null = null;

    if (isNative()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (disposed) return;
        setAppIsActive(isActive);
        if (!isActive) return;
        void refreshForegroundPermission();
        void refreshIosPermission();
        if (isSharing) {
          void refreshNow();
          void ensureNativeBridge();
        }
      }).then((handle) => {
        appListener = handle;
      }).catch(() => {
        /* ignore */
      });
    }

    const onVisibility = () => {
      const visible = document.visibilityState === 'visible';
      setDocumentVisible(visible);
      if (!visible) return;
      void refreshForegroundPermission();
      void refreshIosPermission();
      if (isSharing) {
        void refreshNow();
        void ensureNativeBridge();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    return () => {
      disposed = true;
      if (appListener) void appListener.remove();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [ensureNativeBridge, isSharing, refreshForegroundPermission, refreshIosPermission, refreshNow]);

  useEffect(() => {
    const clearRuntimeTracking = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (watchCleanupRef.current) {
        watchCleanupRef.current();
        watchCleanupRef.current = null;
      }
      if (bgHandleRef.current) {
        void bgHandleRef.current.stop();
        bgHandleRef.current = null;
      }
      setDiagnostics((prev) => ({
        ...prev,
        jsForegroundWatcherActive: false,
      }));
    };

    clearRuntimeTracking();

    if (!isSharing || !user?.id) {
      if (isIosNative) {
        void stopNativeBackgroundMonitoring();
      }
      setIsUpdating(false);
      return () => {
        clearRuntimeTracking();
      };
    }

    let cancelled = false;

    const handleCoords = (coords: Coords, trigger: string) => {
      if (cancelled) return;
      setCurrentPosition(coords);
      setDiagnostics((prev) => ({
        ...prev,
        lastForegroundFixAt: new Date(coords.timestamp || Date.now()).toISOString(),
      }));
      clearError();
      void uploadCoords(coords, trigger);
    };

    const doUpdate = async (trigger: string) => {
      if (cancelled) return;
      setIsUpdating(true);
      try {
        const coords = await geolocation.getCurrentPosition({ timeoutMs: 12000, enableHighAccuracy: true });
        handleCoords(coords, trigger);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Location error';
        if (!cancelled) {
          reportError(message);
          setDiagnostics((prev) => ({
            ...prev,
            lastUploadError: message,
          }));
        }
        console.error('[location] update failed', { trigger, error: err });
      } finally {
        if (!cancelled) {
          setIsUpdating(false);
        }
      }
    };

    if (isIosNative) {
      void refreshIosPermission();
      void ensureNativeBridge();

      if (isForeground) {
        watchCleanupRef.current = geolocation.watchPosition(
          (coords) => {
            const now = Date.now();
            setCurrentPosition(coords);
            setDiagnostics((prev) => ({
              ...prev,
              lastForegroundFixAt: new Date(coords.timestamp || now).toISOString(),
            }));
            clearError();
            if (now - lastWatchUploadAtRef.current < 30000) return;
            lastWatchUploadAtRef.current = now;
            void uploadCoords(coords, 'watch');
          },
          (err) => {
            if (cancelled) return;
            reportError(err.message);
            setDiagnostics((prev) => ({
              ...prev,
              lastUploadError: err.message,
            }));
            console.error('[location] iOS watchPosition failed', err);
          }
        );

        setDiagnostics((prev) => ({
          ...prev,
          jsForegroundWatcherActive: true,
        }));

        void doUpdate('startup');
        intervalRef.current = setInterval(() => {
          void doUpdate('interval');
        }, 45000);
      }

      return () => {
        cancelled = true;
        clearRuntimeTracking();
      };
    }

    if (isBackgroundGeoSupported()) {
      void startBackgroundGeolocation(
        (coords) => {
          if (cancelled) return;
          handleCoords(coords, 'background_geo');
        },
        (err) => {
          if (!cancelled) reportError(err.message);
        }
      ).then((handle) => {
        bgHandleRef.current = handle;
        if (cancelled) void handle.stop();
      });
    }

    void doUpdate('startup');
    intervalRef.current = setInterval(() => {
      void doUpdate(isForeground ? 'interval' : 'background_interval');
    }, isNative() ? 45000 : 120000);

    return () => {
      cancelled = true;
      clearRuntimeTracking();
      if (isIosNative) {
        void stopNativeBackgroundMonitoring();
      }
    };
  }, [
    clearError,
    ensureNativeBridge,
    isForeground,
    isIosNative,
    isSharing,
    refreshIosPermission,
    reportError,
    uploadCoords,
    user?.id,
  ]);

  const value = useMemo<LocationTrackingContextValue>(() => ({
    currentPosition,
    error,
    permissionState,
    isUpdating,
    diagnostics,
    refreshNow,
  }), [currentPosition, diagnostics, error, isUpdating, permissionState, refreshNow]);

  return value;
}

export function LocationTrackingProvider({ children }: { children: ReactNode }) {
  const value = useProvideLocationTracking();
  return <LocationTrackingContext.Provider value={value}>{children}</LocationTrackingContext.Provider>;
}

export function useLocationTracking() {
  const context = useContext(LocationTrackingContext);
  if (!context) {
    throw new Error('useLocationTracking must be used within LocationTrackingProvider');
  }
  return context;
}

export function useRealtimeLocations(userIds: string[]) {
  const queryClient = useQueryClient();
  const idsKey = userIds.join(',');

  useEffect(() => {
    if (userIds.length === 0) return;

    const allowed = new Set(userIds);
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
  }, [idsKey, queryClient, userIds]);
}
