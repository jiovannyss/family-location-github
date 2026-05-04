// Налични визуални стилове за картата (Leaflet raster tiles)
// Без регистрация и без API ключ.

export type MapStyleId = 'voyager' | 'positron';

export interface MapStyleConfig {
  id: MapStyleId;
  name: string;
  description: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

export const MAP_STYLES: Record<MapStyleId, MapStyleConfig> = {
  voyager: {
    id: 'voyager',
    name: 'Voyager',
    description: 'Топъл, балансиран стил с пастелни цветове',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
  positron: {
    id: 'positron',
    name: 'Positron',
    description: 'Минималистичен светъл стил — маркерите изпъкват',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
};

const STORAGE_KEY = 'mapStyle';
const DEFAULT_STYLE: MapStyleId = 'voyager';

export function getStoredMapStyle(): MapStyleId {
  if (typeof window === 'undefined') return DEFAULT_STYLE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'voyager' || v === 'positron') return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_STYLE;
}

export function setStoredMapStyle(id: MapStyleId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
    window.dispatchEvent(new CustomEvent('mapstyle:change', { detail: id }));
  } catch {
    /* ignore */
  }
}

export function getMapStyleConfig(id?: MapStyleId): MapStyleConfig {
  return MAP_STYLES[id ?? getStoredMapStyle()] ?? MAP_STYLES[DEFAULT_STYLE];
}
