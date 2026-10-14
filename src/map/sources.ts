import type { RasterSourceSpecification } from '@nivgreen/maplibre-gl-js-crs84';
import { lonLatBounds, quadGrid, type Bounds } from '../geo/crs';
import { fetchJson } from '../geo/http';
import { discover, loadMatrixSet, tileTemplateOf } from '../geo/ogc';
import { registerRegrid, regridMaxZoom } from '../geo/regrid';
import type { Fetcher, WorldCrs } from '../geo/types';
import { loadCapabilities, loadCswCatalog, planWmts, type RasterPlan } from '../geo/wmts';
import type { HeaderRow, SourceLayer } from '../types';
import { registerFetchPrefix, templatePrefix } from './headers';
import { reprojection } from './setup';
import { chooseStyleSource, type AppliedStyle } from './style';

export const mercatorLatitude = 85.051129;

export type ResolvedRaster = {
  kind: 'raster';
  key: string;
  title: string;
  opacity: number;
  source: RasterSourceSpecification;
  bounds?: Bounds;
};
export type ResolvedVector = {
  kind: 'vector';
  key: string;
  title: string;
  opacity: number;
  tiles: string;
  minzoom: number;
  maxzoom: number;
  bounds?: Bounds;
  style?: AppliedStyle;
};
export type Resolved = ResolvedRaster | ResolvedVector;

type Context = {
  instance: string;
  worldCrs: WorldCrs;
  fetcher: Fetcher;
  headers: HeaderRow[];
  replace: (value: string) => string;
};

const clampToMercator = (bounds: Bounds | undefined): Bounds | undefined =>
  bounds && [bounds[0], Math.max(bounds[1], -mercatorLatitude), bounds[2], Math.min(bounds[3], mercatorLatitude)];

// A 4326 template drawn on a Web Mercator map; the plugin requests source level z - 1 for mercator tile z.
function reprojected(ctx: Context, key: string, template: string, tileSize: number) {
  registerFetchPrefix(key, templatePrefix(template), ctx.headers);
  const size = tileSize === 256 ? '' : `&ssize=${tileSize}`;
  const source = template.replace(/\{z\}/g, '{sz}').replace(/\{x\}/g, '{sx}').replace(/\{y\}/g, '{sy}');
  return `${reprojection.protocol}://bbox={bbox-epsg-3857}&z={z}&x={x}&y={y}${size}://${source}`;
}

function wmtsSource(
  ctx: Context,
  key: string,
  { tiles, reprojected: isReprojected }: RasterPlan
): ResolvedRaster['source'] {
  const bounds = isReprojected ? clampToMercator(tiles.bounds) : tiles.bounds;
  const extent = bounds ? { bounds } : {};
  if (tiles.kind === 'plate-carree') {
    const url = registerRegrid(key, { tiles, worldCrs: ctx.worldCrs, fetcher: ctx.fetcher });
    return {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
      minzoom: 0,
      maxzoom: regridMaxZoom(tiles, ctx.worldCrs),
      ...extent,
    };
  }
  const template = tiles.tileUrl('{z}', '{x}', '{y}');
  if (!isReprojected) {
    return {
      type: 'raster',
      tiles: [template],
      tileSize: tiles.tileSize,
      minzoom: tiles.minLevel,
      maxzoom: tiles.maxLevel,
      ...extent,
    };
  }
  return {
    type: 'raster',
    tiles: [reprojected(ctx, key, template, tiles.tileSize)],
    tileSize: 256,
    minzoom: tiles.minLevel + 1,
    maxzoom: tiles.maxLevel + 1,
    ...extent,
  };
}

async function loadStyle(ctx: Context, styleUrl: string | undefined): Promise<AppliedStyle | undefined> {
  const url = styleUrl && ctx.replace(styleUrl).trim();
  if (!url) {
    return undefined;
  }
  const document = await fetchJson(ctx.fetcher, url);
  return { document, styleUrl: url, ...chooseStyleSource(document) };
}

async function resolveOne(ctx: Context, layer: SourceLayer): Promise<Resolved[]> {
  const url = ctx.replace(layer.url).trim();
  if (!url) {
    return [];
  }
  const key = `${ctx.instance}:${layer.id}`;
  const base = { title: layer.name || url, opacity: layer.opacity ?? 1 };
  const grid = layer.grid ?? 'WorldCRS84Quad';
  switch (layer.kind) {
    case 'xyz-raster': {
      const tileSize = layer.tileSize || 256;
      const minzoom = layer.minzoom ?? 0;
      const maxzoom = layer.maxzoom ?? 22;
      if (grid === ctx.worldCrs) {
        return [{ ...base, kind: 'raster', key, source: { type: 'raster', tiles: [url], tileSize, minzoom, maxzoom } }];
      }
      if (grid === 'WebMercatorQuad') {
        throw new Error('A Web Mercator raster cannot be drawn on an EPSG:4326 map.');
      }
      const tiles = [reprojected(ctx, key, url, tileSize)];
      return [
        {
          ...base,
          kind: 'raster',
          key,
          source: { type: 'raster', tiles, tileSize: 256, minzoom: minzoom + 1, maxzoom: maxzoom + 1 },
        },
      ];
    }
    case 'wmts': {
      const capabilities = await loadCapabilities(ctx.fetcher, url);
      const ids = layer.selected?.length ? layer.selected : [];
      return ids.map((id) => {
        const plan = planWmts(capabilities, id, ctx.worldCrs);
        const layerKey = `${key}:${id}`;
        return {
          ...base,
          kind: 'raster',
          key: layerKey,
          title: id,
          source: wmtsSource(ctx, layerKey, plan),
          bounds: plan.tiles.bounds,
        };
      });
    }
    case 'csw': {
      const catalog = await loadCswCatalog(ctx.fetcher, url);
      const picked = catalog.filter((entry) => layer.selected?.includes(entry.id));
      return Promise.all(
        picked.map(async (entry) => {
          const capabilities = await loadCapabilities(ctx.fetcher, entry.capabilitiesUrl);
          const plan = planWmts(capabilities, entry.wmtsLayerId, ctx.worldCrs);
          const entryKey = `${key}:${entry.id}`;
          return {
            ...base,
            kind: 'raster',
            key: entryKey,
            title: entry.title,
            source: wmtsSource(ctx, entryKey, plan),
            bounds: plan.tiles.bounds,
          } as Resolved;
        })
      );
    }
    case 'mvt': {
      if (grid !== ctx.worldCrs) {
        throw new Error(`Vector tiles in ${grid} cannot be drawn on a ${ctx.worldCrs} map.`);
      }
      const style = await loadStyle(ctx, layer.styleUrl);
      return [
        { ...base, kind: 'vector', key, tiles: url, minzoom: layer.minzoom ?? 0, maxzoom: layer.maxzoom ?? 14, style },
      ];
    }
    case 'ogc-api': {
      const [tilesets, style] = await Promise.all([discover(ctx.fetcher, url), loadStyle(ctx, layer.styleUrl)]);
      const picked = tilesets.filter((tileset) => layer.selected?.includes(tileset.id));
      return Promise.all(
        picked.map(async (tileset) => {
          const matrixSet = await loadMatrixSet(ctx.fetcher, tileset);
          const quad = quadGrid(
            matrixSet.crs,
            matrixSet.tileMatrices.map((m) => ({ ...m, origin: m.pointOfOrigin }))
          );
          if (typeof quad === 'string') {
            throw new Error(`${tileset.title}: ${quad}`);
          }
          if (quad.quad !== ctx.worldCrs) {
            throw new Error(`${tileset.title} is tiled in ${quad.quad} and cannot be drawn on a ${ctx.worldCrs} map.`);
          }
          const template = tileTemplateOf(tileset);
          if (!template) {
            throw new Error(`${tileset.title} advertises no tile URL template.`);
          }
          const box = tileset.boundingBox;
          return {
            ...base,
            kind: 'vector',
            key: `${key}:${tileset.id}`,
            title: tileset.title,
            tiles: template
              .replace(/\{tileMatrix\}/gi, `${quad.prefix}{z}`)
              .replace(/\{tileCol\}/gi, '{x}')
              .replace(/\{tileRow\}/gi, '{y}'),
            minzoom: quad.minLevel,
            maxzoom: quad.maxLevel,
            bounds: box && lonLatBounds(box.lowerLeft, box.upperRight, box.crs ?? matrixSet.crs),
            style,
          } as Resolved;
        })
      );
    }
  }
}

// Resolves every visible source; one failing source does not hide the others.
export async function resolveSources(ctx: Context, layers: SourceLayer[]) {
  const errors: string[] = [];
  const resolved = await Promise.all(
    layers
      .filter((layer) => layer.visible !== false)
      .map((layer) =>
        resolveOne(ctx, layer).catch((error: unknown) => {
          errors.push(`${layer.name || layer.url}: ${error instanceof Error ? error.message : String(error)}`);
          return [] as Resolved[];
        })
      )
  );
  return { layers: resolved.flat(), errors };
}
