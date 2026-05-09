/**
 * Втори, „upgrade" диалог за background location.
 *
 * Показва се след като foreground (`location`) е granted, но background
 * (`ACCESS_BACKGROUND_LOCATION`) още не е. На Android 11+ системата НЕ
 * показва опция „Allow all the time" в стандартния prompt — тя е достъпна
 * само през настройките на приложението.
 *
 * Бутонът „Отвори настройки" използва native intent
 * (ACTION_APPLICATION_DETAILS_SETTINGS) през BgLocationBridge plugin.
 */
import { motion } from 'framer-motion';
import { Settings, Lock, ArrowRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { openAppSettings } from '@/services/backgroundLocationPermission';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ако е true — показваме по-сериозен текст (вече сме засекли пропусната заявка) */
  detectedFailure?: boolean;
}

export default function BackgroundUpgradeDialog({ open, onClose, detectedFailure }: Props) {
  const handleOpenSettings = async () => {
    await openAppSettings();
    // не затваряме веднага — потребителят се връща в app-а след промяна
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6 top-[5dvh] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]">
        <DialogHeader>
          <div className="w-14 h-14 rounded-2xl bg-warning/10 text-warning flex items-center justify-center mb-3 mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <DialogTitle className="text-center text-xl">
            Още една стъпка за пълно споделяне
          </DialogTitle>
          <DialogDescription className="text-center">
            Активирайте „Позволи винаги" в настройките
          </DialogDescription>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 py-2"
        >
          {detectedFailure && (
            <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>
                Член от вашия кръг поиска вашата локация, но телефонът не позволи да я изпратим
                — приложението няма разрешение да достъпва GPS при заключен екран.
              </p>
            </div>
          )}

          <p className="text-sm text-foreground">
            В момента вашата локация се споделя <strong>само докато приложението е отворено</strong>.
            За да я виждат членовете на кръга и при заключен екран или когато приложението не е стартирано,
            трябва ръчно да изберете опцията <strong>„Позволи винаги" / „Allow all the time"</strong>.
          </p>

          <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Как да я активирате
            </p>
            <ol className="space-y-2 text-sm">
              <Step n={1} text={'Натиснете „Отвори настройки" по-долу'} />
              <Step n={2} text={'Изберете „Permissions" → „Location"'} />
              <Step n={3} text={'Маркирайте „Allow all the time" / „Позволи винаги"'} />
            </ol>
          </div>

          <p className="text-xs text-muted-foreground">
            Android (версия 11 и нагоре) не позволява тази опция да бъде показана в първоначалния прозорец —
            затова е нужна ръчна стъпка от настройките.
          </p>
        </motion.div>

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleOpenSettings} size="lg" className="w-full gap-2">
            <Settings className="w-4 h-4" />
            Отвори настройки
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button onClick={onClose} variant="ghost" size="sm" className="w-full">
            По-късно
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
        {n}
      </span>
      <span className="text-foreground">{text}</span>
    </li>
  );
}
