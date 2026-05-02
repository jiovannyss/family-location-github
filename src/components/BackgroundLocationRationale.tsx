/**
 * Pre-permission rationale за background location.
 *
 * Показва се ВЕДНЪЖ преди да поискаме OS permission prompt-а за
 * "Always" / "Background" location. Изисква се от Google Play (background
 * location policy) и силно препоръчвано от Apple — иначе store rejection.
 *
 * Текстовете са BG + EN едновременно за store ревюъри.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Shield, Users, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function BackgroundLocationRationale({ open, onAccept, onDecline }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDecline(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3 mx-auto">
            <MapPin className="w-7 h-7" />
          </div>
          <DialogTitle className="text-center text-xl">
            Достъп до местоположение „Винаги"
          </DialogTitle>
          <DialogDescription className="text-center">
            Always location permission
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 py-2"
          >
            <RationaleItem
              icon={<Users className="w-5 h-5" />}
              titleBg="Само със семейството ви"
              titleEn="Only with your family"
              bodyBg="Локацията се споделя единствено с приети членове на вашите кръгове. Никой друг потребител няма достъп."
              bodyEn="Location is shared only with accepted members of your circles. No other user has access."
            />
            <RationaleItem
              icon={<MapPin className="w-5 h-5" />}
              titleBg="Защо „Винаги"?"
              titleEn="Why 'Always'?"
              bodyBg="За да можете да бъдете видими на близките си дори когато телефонът е заключен или приложението е минимизирано — например по време на път до вкъщи."
              bodyEn="So your loved ones can see you even when the phone is locked or the app is in the background — e.g. on the way home."
            />
            <RationaleItem
              icon={<Power className="w-5 h-5" />}
              titleBg="Вие контролирате"
              titleEn="You're in control"
              bodyBg="Можете да спрете споделянето с един бутон по всяко време. Спрете и приложението няма да изпраща позиции."
              bodyEn="You can stop sharing with one tap at any time. When stopped, the app sends no location."
            />
            <RationaleItem
              icon={<Shield className="w-5 h-5" />}
              titleBg="Без реклами, без продажба на данни"
              titleEn="No ads, no data selling"
              bodyBg="Локацията ви не се използва за реклама и не се продава на трети страни."
              bodyEn="Your location is never used for advertising or sold to third parties."
            />
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={onAccept} size="lg" className="w-full">
            Продължи / Continue
          </Button>
          <Button onClick={onDecline} variant="ghost" size="sm" className="w-full">
            Не сега / Not now
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center pt-2">
          След това операционната система ще покаже свой собствен прозорец за разрешение.<br />
          The operating system will then show its own permission prompt.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function RationaleItem({
  icon, titleBg, titleEn, bodyBg, bodyEn,
}: { icon: React.ReactNode; titleBg: string; titleEn: string; bodyBg: string; bodyEn: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-9 h-9 rounded-lg bg-muted text-foreground flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="space-y-0.5 min-w-0">
        <p className="font-medium text-sm">{titleBg} <span className="text-muted-foreground font-normal">/ {titleEn}</span></p>
        <p className="text-xs text-muted-foreground">{bodyBg}</p>
        <p className="text-xs text-muted-foreground italic">{bodyEn}</p>
      </div>
    </div>
  );
}
