import type { WorldCrs } from './geo/types';

export type SourceKind = 'xyz-raster' | 'wmts' | 'csw' | 'mvt' | 'ogc-api';

export interface SourceLayer {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  visible: boolean;
  opacity: number;
  // Tile grid of a template (xyz-raster, mvt).
  grid?: WorldCrs;
  minzoom?: number;
  maxzoom?: number;
  tileSize?: number;
  // Layer ids picked from a WMTS, CSW or OGC API catalog.
  selected?: string[];
  // MapLibre style URL for vector sources.
  styleUrl?: string;
}

export interface HeaderRow {
  id: string;
  enabled: boolean;
  name: string;
  value: string;
  // Only sent to this host and its subdomains when set.
  host: string;
}

export type LocationMode = 'auto' | 'coords' | 'geohash';

export interface DataLayer {
  id: string;
  name: string;
  type: 'markers' | 'heatmap';
  visible: boolean;
  // Query refId; empty means every frame.
  query?: string;
  location: { mode: LocationMode; latitude?: string; longitude?: string; geohash?: string };
  markers: {
    color: string;
    colorField?: string;
    size: number;
    sizeField?: string;
    minSize: number;
    maxSize: number;
    opacity: number;
  };
  heatmap: { weightField?: string; radius: number; intensity: number; opacity: number };
}

export interface ViewOptions {
  mode: 'fit' | 'coords';
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface MapOptions {
  projection: WorldCrs;
  view: ViewOptions;
  showZoom: boolean;
  showScale: boolean;
  tileDebug: boolean;
  tooltip: 'none' | 'hover' | 'click';
  sources: SourceLayer[];
  headers: HeaderRow[];
  dataLayers: DataLayer[];
}

export const newId = () => Math.random().toString(36).slice(2, 10);
