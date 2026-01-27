import { motion } from 'framer-motion';
import { MapPin, MapPinOff, Loader2, AlertCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { useSharingState, useLocationTracking } from '@/hooks/useLocation';
import { toast } from 'sonner';

export default function SharingToggle() {
  const { isSharing, toggleSharing, isToggling } = useSharingState();
  const { permissionState, currentPosition, error } = useLocationTracking();

  const handleToggle = async (checked: boolean) => {
    if (checked && permissionState === 'denied') {
      toast.error('Достъпът до местоположението е забранен. Моля, разрешете го в настройките на браузъра.');
      return;
    }

    toggleSharing(checked, {
      onSuccess: () => {
        if (checked) {
          toast.success('Споделянето на местоположение е включено');
        } else {
          toast.info('Споделянето на местоположение е изключено');
        }
      },
      onError: () => {
        toast.error('Грешка при промяна на споделянето');
      },
    });
  };

  return (
    <Card className={`transition-all duration-300 ${isSharing ? 'ring-2 ring-primary shadow-glow' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ 
                scale: isSharing ? [1, 1.1, 1] : 1,
              }}
              transition={{ 
                duration: 2, 
                repeat: isSharing ? Infinity : 0,
                ease: 'easeInOut'
              }}
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isSharing 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {isSharing ? (
                <MapPin className="w-6 h-6" />
              ) : (
                <MapPinOff className="w-6 h-6" />
              )}
            </motion.div>
            <div>
              <h3 className="font-medium text-foreground">
                Споделяне на местоположение
              </h3>
              <p className="text-sm text-muted-foreground">
                {isSharing 
                  ? 'Членовете на кръга виждат вашата позиция' 
                  : 'Местоположението не се споделя'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {isToggling && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
            <Switch
              checked={isSharing}
              onCheckedChange={handleToggle}
              disabled={isToggling}
            />
          </div>
        </div>

        {permissionState === 'denied' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 p-3 bg-destructive/10 rounded-lg flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">
              Достъпът до местоположението е блокиран. 
              Моля, разрешете го в настройките на браузъра, за да споделяте локацията си.
            </p>
          </motion.div>
        )}

        {error && isSharing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 p-3 bg-warning/10 rounded-lg flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
            <p className="text-sm text-warning-foreground">
              Възникна проблем при получаване на местоположението: {error}
            </p>
          </motion.div>
        )}

        {isSharing && currentPosition && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 pt-3 border-t border-border text-sm text-muted-foreground"
          >
            <div className="flex items-center justify-between">
              <span>Последна позиция:</span>
              <span className="font-mono text-xs">
                {currentPosition.coords.latitude.toFixed(5)}, {currentPosition.coords.longitude.toFixed(5)}
              </span>
            </div>
            {currentPosition.coords.accuracy && (
              <div className="flex items-center justify-between mt-1">
                <span>Точност:</span>
                <span>±{Math.round(currentPosition.coords.accuracy)} метра</span>
              </div>
            )}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
