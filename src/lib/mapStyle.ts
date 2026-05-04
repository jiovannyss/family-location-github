// Налични визуални стилове за картата (Leaflet raster tiles)
// Всички са безплатни и без API ключ.

export type MapStyleId =
  | 'voyager'
  | 'positron'
  | 'darkmatter'
  | 'esri_imagery'
  | 'esri_topo'
  | 'esri_street'
  | 'opentopo'
  | 'osm';

export interface MapStyleConfig {
  id: MapStyleId;
  name: string;
  description: string;
  url: string;
  attribution: string;
  maxZoom: number;
  /** Subdomains за {s} placeholder (по подразбиране ['a','b','c']) */
  subdomains?: string;
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
  darkmatter: {
    id: 'darkmatter',
    name: 'Dark Matter',
    description: 'Тъмен режим — черно с неонови акценти',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
  esri_imagery: {
    id: 'esri_imagery',
    name: 'Сателит',
    description: 'Сателитни снимки от Esri',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
    subdomains: '',
  },
  esri_topo: {
    id: 'esri_topo',
    name: 'Топографски',
    description: 'Топографска карта с релеф (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI',
    maxZoom: 19,
    subdomains: '',
  },
  esri_street: {
    id: 'esri_street',
    name: 'Esri улици',
    description: 'Класически street стил от Esri',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom',
    maxZoom: 19,
    subdomains: '',
  },
  opentopo: {
    id: 'opentopo',
    name: 'OpenTopoMap',
    description: 'Туристическа карта с контури и релеф',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  },
  osm: {
    id: 'osm',
    name: 'OpenStreetMap',
    description: 'Класическият OSM стил — ярък и детайлен',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
};

const STORAGE_KEY = 'mapStyle';
const DEFAULT_STYLE: MapStyleId = 'voyager';

const VALID_IDS = new Set<MapStyleId>(Object.keys(MAP_STYLES) as MapStyleId[]);

export function getStoredMapStyle(): MapStyleId {
  if (typeof window === 'undefined') return DEFAULT_STYLE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && VALID_IDS.has(v as MapStyleId)) return v as MapStyleId;
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
