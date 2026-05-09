/**
 * Постоянен warning banner на главния екран — показва се само когато:
 *   - sharing е включено
 *   - native Android
 *   - background-location permission не е „granted"
 *
 * Кликът отваря BackgroundUpgradeDialog. При засечен failure от native
 * service-а, диалогът се отваря автоматично.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { isNative, nativePlatform } from '@/services/platform';
import { useSharingState } from '@/hooks/useLocation';
import { useBackgroundPermissionWatcher } from '@/hooks/useBackgroundPermissionWatcher';
import { platformLabels } from '@/services/backgroundLocationPermission';
import BackgroundUpgradeDialog from './BackgroundUpgradeDialog';

export default function BackgroundPermissionBanner() {
  const { isSharing } = useSharingState();
  const platform = nativePlatform();
  const enabled = isNative() && (platform === 'android' || platform === 'ios') && isSharing;
  const labels = platformLabels();
  const { status, autoPromptForFailure, dismissAutoPrompt } =
    useBackgroundPermissionWatcher(enabled);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoPromptForFailure) setOpen(true);
  }, [autoPromptForFailure]);

  if (!enabled) return null;
  if (!status || status.background === 'granted') return null;

  return (
    <>
      <AnimatePresence>
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="w-full flex items-start gap-3 p-3 rounded-xl border border-warning/40 bg-warning/10 text-left hover:bg-warning/15 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Локацията се споделя само при отворено приложение
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Натиснете, за да активирате „{labels.alwaysOption}" за заключен екран.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
        </motion.button>
      </AnimatePresence>

      <BackgroundUpgradeDialog
        open={open}
        onClose={() => { setOpen(false); dismissAutoPrompt(); }}
        detectedFailure={autoPromptForFailure}
      />
    </>
  );
}
