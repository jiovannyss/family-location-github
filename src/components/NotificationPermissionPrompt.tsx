import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';

export default function NotificationPermissionPrompt() {
  const { shouldPrompt, request, dismiss } = useNotificationPermission();

  return (
    <AnimatePresence>
      {shouldPrompt && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="rounded-xl border border-border bg-card shadow-sm p-3 sm:p-4 flex items-start gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm sm:text-base text-foreground">
              Включете известия
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              За да получавате съобщения от членовете на вашите кръгове, дори когато приложението е във фон.
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => request()}>
                Разреши
              </Button>
              <Button size="sm" variant="ghost" onClick={() => dismiss()}>
                По-късно
              </Button>
            </div>
          </div>
          <button
            onClick={() => dismiss()}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Затвори"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
