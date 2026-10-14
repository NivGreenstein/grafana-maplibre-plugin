import type { WorldCRSName } from '@nivgreen/maplibre-gl-js-crs84';

// The two tile matrix sets the MapLibre fork can work in.
export type WorldCrs = WorldCRSName;

// A fetch that adds the panel's request headers.
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type Link = { href: string; rel?: string; type?: string; title?: string; templated?: boolean };
export type Tileset = {
  id: string;
  title: string;
  description?: string;
  dataType?: string;
  crs?: string;
  tileMatrixSetId?: string;
  boundingBox?: { lowerLeft: number[]; upperRight: number[]; crs?: string };
  links: Link[];
};
export type TileMatrix = {
  id: string;
  scaleDenominator: number;
  cellSize?: number;
  pointOfOrigin: number[];
  tileWidth: number;
  tileHeight: number;
  matrixWidth: number;
  matrixHeight: number;
};
export type MatrixSet = { id: string; title?: string; crs: string; tileMatrices: TileMatrix[] };

// A parsed WMTS GetCapabilities document, as ol/format/WMTSCapabilities reads it.
export type Capabilities = Record<string, unknown>;
export type RasterEntry = {
  id: string;
  title: string;
  capabilitiesUrl: string;
  wmtsLayerId: string;
  matrixSets: string[];
};
