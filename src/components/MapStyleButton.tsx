import { useEffect, useState } from 'react';
import { Layers, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  MAP_STYLES,
  MapStyleId,
  getStoredMapStyle,
  setStoredMapStyle,
} from '@/lib/mapStyle';

/**
 * Sticky бутонче за смяна на стила на картата.
 * Позиционира се абсолютно — да го сложиш вътре в `position: relative` контейнер.
 */
export default function MapStyleButton() {
  const [styleId, setStyleId] = useState<MapStyleId>(() => getStoredMapStyle());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MapStyleId>).detail;
      if (detail && detail in MAP_STYLES) setStyleId(detail);
    };
    window.addEventListener('mapstyle:change', handler);
    return () => window.removeEventListener('mapstyle:change', handler);
  }, []);

  const handlePick = (id: MapStyleId) => {
    setStyleId(id);
    setStoredMapStyle(id);
    setOpen(false);
  };

  return (
    <div className="absolute top-3 right-3 z-10">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Смени стила на картата"
            className="w-10 h-10 rounded-lg bg-card border border-border shadow-md flex items-center justify-center hover:bg-accent transition"
          >
            <Layers className="w-5 h-5 text-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={8}
          className="w-64 p-2 z-[60]"
        >
          <p className="text-xs font-medium text-muted-foreground px-2 py-1.5">
            Стил на картата
          </p>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {(Object.values(MAP_STYLES) as typeof MAP_STYLES[MapStyleId][]).map((s) => {
              const selected = styleId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handlePick(s.id)}
                  className={`w-full flex items-center justify-between gap-2 p-2 rounded-md text-left transition ${
                    selected
                      ? 'bg-primary/10 text-foreground'
                      : 'hover:bg-accent text-foreground'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.description}
                    </p>
                  </div>
                  {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
