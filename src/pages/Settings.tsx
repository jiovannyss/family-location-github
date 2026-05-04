import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Map as MapIcon, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Header from '@/components/Header';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import { MAP_STYLES, MapStyleId, getStoredMapStyle, setStoredMapStyle } from '@/lib/mapStyle';

export default function Settings() {
  const navigate = useNavigate();
  const [mapStyle, setMapStyle] = useState<MapStyleId>(() => getStoredMapStyle());

  useHardwareBackButton();

  const handleMapStyleChange = (id: MapStyleId) => {
    setMapStyle(id);
    setStoredMapStyle(id);
    toast.success(`Стилът на картата е сменен на ${MAP_STYLES[id].name}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container max-w-2xl px-4 py-6 pt-[calc(3.5rem+env(safe-area-inset-top)+1rem)] sm:pt-[calc(4rem+env(safe-area-inset-top)+1.5rem)]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-2 sm:gap-4 sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.25rem)] z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 py-1">
            <Button variant="outline" size="sm" onClick={() => navigate('/')} aria-label="Назад към началото" className="shrink-0 gap-2">
              <ArrowLeft className="w-5 h-5" />
              <span>Назад</span>
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Настройки</h1>
          </div>

          {/* Map style selector */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapIcon className="w-5 h-5" />
                Стил на картата
              </CardTitle>
              <CardDescription>
                Изберете визуален стил на картата
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(Object.values(MAP_STYLES) as typeof MAP_STYLES[MapStyleId][]).map((style) => {
                const selected = mapStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => handleMapStyleChange(style.id)}
                    aria-pressed={selected}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-secondary/40 hover:bg-secondary'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{style.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{style.description}</p>
                    </div>
                    {selected && <Check className="w-5 h-5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
