import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bug, RefreshCw, Send, Bell, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isNative, nativePlatform } from '@/services/platform';
import { getDeviceIdAsync } from '@/services/deviceId';
import { push, pushDiag, ensurePushLifecycleStarted } from '@/services/push';
import { toast } from 'sonner';

interface Diag {
  pushEnabled: boolean;
  platform: string;
  isNative: boolean;
  lifecycleStarted: boolean;
  earlyReturnReason: string | null;
  permission: string;
  userId: string | null;
  deviceId: string;
  tokenInDb: boolean;
  tokenLen: number | null;
  tokenUpdatedAt: string | null;
  tokensCount: number;
  notifPermission: string;
  // live diagnostics
  registerCalled: boolean;
  registerCallError: string | null;
  registrationEventFired: boolean;
  registrationError: string | null;
  lastTokenLength: number | null;
  lastTokenAt: string | null;
  lastDbUpsertError: string | null;
  lastDbUpsertAt: string | null;
  listenersAttached: boolean;
  lastPermissionState: string | null;
  pluginLoadError: string | null;
}

export default function PushDiagnostics() {
  const { user } = useAuth();
  const [d, setD] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(false);
  const [reregistering, setReregistering] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      try { await ensurePushLifecycleStarted(); } catch (e) { console.warn('[diag] ensurePushLifecycleStarted', e); }
      const pushEnabled = isNative() && import.meta.env.VITE_DISABLE_PUSH !== 'true';
      const deviceId = await getDeviceIdAsync();
      let permission = 'n/a';
      if (isNative() && pushEnabled) {
        try {
          const m = await import('@capacitor/push-notifications');
          const r = await m.PushNotifications.checkPermissions();
          permission = r.receive;
        } catch (e) {
          permission = 'plugin-error: ' + (e as Error).message;
        }
      }
      let tokenInDb = false;
      let tokenLen: number | null = null;
      let tokenUpdatedAt: string | null = null;
      let tokensCount = 0;
      if (user) {
        const { data, error } = await supabase
          .from('push_tokens')
          .select('token, updated_at, device_id')
          .eq('user_id', user.id);
        if (error) console.warn('[diag] push_tokens select error', error);
        if (!error && data) {
          tokensCount = data.length;
          const own = data.find((t) => t.device_id === deviceId);
          if (own) {
            tokenInDb = true;
            tokenLen = own.token?.length ?? null;
            tokenUpdatedAt = own.updated_at;
          }
        }
      }
      const notifPermission =
        typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

      setD({
        pushEnabled,
        platform: nativePlatform(),
        isNative: isNative(),
        lifecycleStarted: pushDiag.lifecycleStarted,
        earlyReturnReason: pushDiag.earlyReturnReason,
        permission,
        userId: user?.id ?? null,
        deviceId,
        tokenInDb,
        tokenLen,
        tokenUpdatedAt,
        tokensCount,
        notifPermission,
        registerCalled: pushDiag.registerCalled,
        registerCallError: pushDiag.registerCallError,
        registrationEventFired: pushDiag.registrationEventFired,
        registrationError: pushDiag.registrationError,
        lastTokenLength: pushDiag.lastTokenLength,
        lastTokenAt: pushDiag.lastTokenAt,
        lastDbUpsertError: pushDiag.lastDbUpsertError,
        lastDbUpsertAt: pushDiag.lastDbUpsertAt,
        listenersAttached: pushDiag.listenersAttached,
        lastPermissionState: pushDiag.lastPermissionState,
        pluginLoadError: pushDiag.pluginLoadError,
      });
    } finally {
      setLoading(false);
    }
  };

  const reregister = async () => {
    if (!user) { toast.error('Няма влязъл потребител'); return; }
    setReregistering(true);
    try {
      await push.forceReregister(user.id);
      toast.success('Re-register пуснат — изчакай 2-3 сек и натисни Обнови');
      setTimeout(() => { void load(); }, 2500);
    } catch (e) {
      toast.error('Грешка: ' + (e as Error).message);
    } finally {
      setReregistering(false);
    }
  };

  const [testingPush, setTestingPush] = useState<null | 'notification' | 'location_refresh'>(null);
  const [lastTestResult, setLastTestResult] = useState<unknown>(null);

  const sendTest = async (mode: 'notification' | 'location_refresh') => {
    if (!user) { toast.error('Няма влязъл потребител'); return; }
    setTestingPush(mode);
    try {
      const { data, error } = await supabase.functions.invoke('test-push', { body: { mode } });
      if (error) throw error;
      const sent = (data as { sent?: number })?.sent ?? 0;
      const total = (data as { total?: number })?.total ?? 0;
      const reason = (data as { reason?: string })?.reason;
      setLastTestResult(data);
      console.log('[diag] test-push result', data);
      if (sent > 0) toast.success(`Изпратено: ${sent}/${total}. Виж logcat за "push received".`);
      else toast.error(`Изпратено: ${sent}/${total}${reason ? ' — ' + reason : ''}`);
    } catch (e) {
      toast.error('Грешка: ' + (e as Error).message);
      setLastTestResult({ error: (e as Error).message });
    } finally {
      setTestingPush(null);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [user?.id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="w-5 h-5" /> Push диагностика
        </CardTitle>
        <CardDescription>Помага за дебъг на известията</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap justify-end gap-2 mb-2">
          <Button size="sm" variant="outline" onClick={() => sendTest('notification')} disabled={!!testingPush || !user}>
            <Bell className={`w-4 h-4 ${testingPush === 'notification' ? 'animate-pulse' : ''}`} /> Test push
          </Button>
          <Button size="sm" variant="outline" onClick={() => sendTest('location_refresh')} disabled={!!testingPush || !user}>
            <MapPin className={`w-4 h-4 ${testingPush === 'location_refresh' ? 'animate-pulse' : ''}`} /> Test location_refresh
          </Button>
          <Button size="sm" variant="outline" onClick={reregister} disabled={reregistering || !user}>
            <Send className={`w-4 h-4 ${reregistering ? 'animate-pulse' : ''}`} /> Re-register
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Обнови
          </Button>
        </div>
        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
{JSON.stringify(d, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
