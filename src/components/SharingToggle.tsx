import { motion } from 'framer-motion';
import { MapPin, MapPinOff, Loader2, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { useSharingState, useLocationTracking } from '@/hooks/useLocation';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { toast } from 'sonner';
import { storage } from '@/services/storage';
import { isNative, nativePlatform } from '@/services/platform';
import BackgroundLocationRationale from './BackgroundLocationRationale';
import BackgroundUpgradeDialog from './BackgroundUpgradeDialog';
import {
  ensureForegroundLocation,
  checkBackgroundPermission,
  startNativeBackgroundMonitoring,
  stopNativeBackgroundMonitoring,
} from '@/services/backgroundLocationPermission';

const BG_RATIONALE_KEY = 'bg_location_rationale_shown_v1';
const BG_UPGRADE_LAST_PROMPT_KEY = 'bg_upgrade_prompt_shown_at';
const BG_UPGRADE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 дни

export default function SharingToggle() {
  const { isSharing, toggleSharing, isToggling } = useSharingState();
  const { permissionState, currentPosition, error } = useLocationTracking();
  const { canRequest, request: requestNotifPermission } = useNotificationPermission();
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [rationaleShown, setRationaleShown] = useState<boolean | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    storage.get(BG_RATIONALE_KEY).then((v) => setRationaleShown(v === '1'));
  }, []);

  const maybePromptBackgroundUpgrade = async () => {
    if (!isNative() || nativePlatform() !== 'android') return;
    try {
      const status = await checkBackgroundPermission();
      if (status.background === 'granted') return;
      const lastStr = await storage.get(BG_UPGRADE_LAST_PROMPT_KEY);
      const last = lastStr ? Number(lastStr) : 0;
      if (Date.now() - last < BG_UPGRADE_COOLDOWN_MS) return;
      await storage.set(BG_UPGRADE_LAST_PROMPT_KEY, String(Date.now()));
      setUpgradeOpen(true);
    } catch (e) {
      console.warn('[SharingToggle] background check failed', e);
    }
  };

  const proceedToggle = (checked: boolean) => {
    toggleSharing(checked, {
      onSuccess: () => {
        if (checked) {
          toast.success('Споделянето на местоположение е включено');
          if (canRequest) void requestNotifPermission();
          // След като foreground е дадено и sharing е on → провери background
          // и ако липсва, покажи upgrade диалога.
          void (async () => {
            await ensureForegroundLocation();
            await maybePromptBackgroundUpgrade();
          })();
        } else {
          toast.info('Споделянето на местоположение е изключено');
        }
      },
      onError: () => toast.error('Грешка при промяна на споделянето'),
    });
  };

  const handleToggle = async (checked: boolean) => {
    if (checked && permissionState === 'denied') {
      toast.error('Достъпът до местоположението е забранен. Моля, разрешете го в настройките.');
      return;
    }

    // На native: преди първоначалното включване — покажи rationale screen.
    if (checked && isNative() && rationaleShown === false) {
      setRationaleOpen(true);
      return;
    }

    proceedToggle(checked);
  };

  const handleRationaleAccept = async () => {
    await storage.set(BG_RATIONALE_KEY, '1');
    setRationaleShown(true);
    setRationaleOpen(false);
    proceedToggle(true);
  };

  const handleRationaleDecline = () => {
    setRationaleOpen(false);
    toast.info('Можете да включите споделянето по всяко време.');
  };

  return (
    <>
    <Card className={`transition-all duration-300 ${isSharing ? 'border-primary/40 shadow-sm' : ''}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <motion.div
              animate={{ scale: isSharing ? [1, 1.1, 1] : 1 }}
              transition={{ duration: 2, repeat: isSharing ? Infinity : 0, ease: 'easeInOut' }}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                isSharing ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {isSharing ? <MapPin className="w-5 h-5 sm:w-6 sm:h-6" /> : <MapPinOff className="w-5 h-5 sm:w-6 sm:h-6" />}
            </motion.div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm sm:text-base text-foreground leading-tight">
                Споделяне на местоположение
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                {isSharing ? 'Членовете на кръга виждат вашата позиция' : 'Местоположението не се споделя'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isToggling && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <Switch checked={isSharing} onCheckedChange={handleToggle} disabled={isToggling} />
          </div>
        </div>

        {permissionState === 'denied' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 p-3 bg-destructive/10 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-xs sm:text-sm text-destructive">
              Достъпът до местоположението е блокиран. Моля, разрешете го в настройките, за да споделяте локацията си.
            </p>
          </motion.div>
        )}

        {error && isSharing && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 p-3 bg-warning/10 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
            <p className="text-xs sm:text-sm text-warning-foreground break-words">
              Възникна проблем при получаване на местоположението: {error}
            </p>
          </motion.div>
        )}

        {isSharing && currentPosition && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mt-3 pt-3 border-t border-border text-xs sm:text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span>Последна позиция:</span>
              <span className="font-mono text-[11px] sm:text-xs">
                {currentPosition.lat.toFixed(5)}, {currentPosition.lng.toFixed(5)}
              </span>
            </div>
            {currentPosition.accuracy != null && (
              <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
                <span>Точност:</span>
                <span>±{Math.round(currentPosition.accuracy)} метра</span>
              </div>
            )}
          </motion.div>
        )}
      </CardContent>
    </Card>

    <BackgroundLocationRationale
      open={rationaleOpen}
      onAccept={handleRationaleAccept}
      onDecline={handleRationaleDecline}
    />
    <BackgroundUpgradeDialog
      open={upgradeOpen}
      onClose={() => setUpgradeOpen(false)}
    />
    </>
  );
}
