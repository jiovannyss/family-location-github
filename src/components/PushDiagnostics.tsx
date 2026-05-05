import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bug, RefreshCw, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isNative, nativePlatform } from '@/services/platform';
import { getDeviceIdAsync } from '@/services/deviceId';
import { push, pushDiag } from '@/services/push';
import { toast } from 'sonner';

interface Diag {
  pushEnabled: boolean;
  platform: string;
  isNative: boolean;
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
      const pushEnabled = import.meta.env.VITE_ENABLE_PUSH === 'true' || nativePlatform() === 'ios';
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
        <div className="flex justify-end gap-2 mb-2">
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
