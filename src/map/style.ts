import type { LayerSpecification, SourceSpecification, StyleSpecification } from '@nivgreen/maplibre-gl-js-crs84';
import { absolute } from '../geo/http';
import { sourceLayersOf, vectorTileUrl } from '../geo/vectorProtocol';
import type { Resolved } from './sources';

// Adapted from https://github.com/NivGreenstein/ogc-tiles-viewer (src/ogc.ts, src/MapLibreView.tsx).

export type StyleDocument = Record<string, unknown>;
export type AppliedStyle = { document: StyleDocument; source: string; styleUrl?: string };

// One tileset backs one vector source, so only the style layers of a single style source are applied.
export function chooseStyleSource(document: StyleDocument) {
  const sources = (document.sources as Record<string, Record<string, unknown>> | undefined) ?? {};
  const styleLayers = (document.layers as Array<Record<string, unknown>> | undefined) ?? [];
  const ids = Object.keys(sources);
  if (!ids.length) {
    throw new Error('The style declares no sources, so it is not a MapLibre style.');
  }
  const vectorIds = ids.filter((id) => (sources[id]?.type ?? 'vector') === 'vector');
  const [best] = (vectorIds.length ? vectorIds : ids)
    .map((id) => ({ id, drawn: styleLayers.filter((layer) => layer.source === id).length }))
    .sort((a, b) => b.drawn - a.drawn);
  if (!best.drawn) {
    throw new Error(`No style layer draws from "${best.id}".`);
  }
  return { source: best.id };
}

const sourceId = (key: string) => `src:${key}`;

// Colors features by geometry type, with a hue derived from the layer key.
export function hueFor(key: string) {
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % 360;
}

function generatedLayers(key: string, sourceLayer: string, opacity: number): LayerSpecification[] {
  const hue = hueFor(`${key}/${sourceLayer}`);
  const color = `hsl(${hue}, 68%, 54%)`;
  const base = { source: sourceId(key), 'source-layer': sourceLayer };
  const id = `${key}::${sourceLayer}`;
  return [
    {
      ...base,
      id: `${id}::fill`,
      type: 'fill',
      filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
      paint: { 'fill-color': color, 'fill-opacity': 0.45 * opacity, 'fill-outline-color': color },
    },
    {
      ...base,
      id: `${id}::line`,
      type: 'line',
      filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
      paint: { 'line-color': color, 'line-width': 1.5, 'line-opacity': opacity },
    },
    {
      ...base,
      id: `${id}::point`,
      type: 'circle',
      filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]],
      paint: { 'circle-radius': 4, 'circle-color': color, 'circle-opacity': opacity },
    },
  ] as LayerSpecification[];
}

export type Overlay = { sources: Record<string, SourceSpecification>; layers: LayerSpecification[] };

// Sources stack bottom-up in their listed order; data overlays are drawn above them.
export function buildStyle(resolved: Resolved[], overlay: Overlay): StyleSpecification {
  const style: StyleSpecification = { version: 8, sources: {}, layers: [] };
  const styled = resolved.find((layer) => layer.kind === 'vector' && layer.style);
  const document = styled?.kind === 'vector' ? styled.style?.document : undefined;
  const resolveUrl = (href: string) =>
    styled?.kind === 'vector' && styled.style?.styleUrl ? absolute(href, styled.style.styleUrl) : href;
  if (typeof document?.glyphs === 'string') {
    style.glyphs = resolveUrl(document.glyphs);
  }
  if (typeof document?.sprite === 'string') {
    style.sprite = resolveUrl(document.sprite);
  }
  for (const layer of resolved) {
    const id = sourceId(layer.key);
    if (layer.kind === 'raster') {
      style.sources[id] = layer.source;
      style.layers.push({ id: layer.key, type: 'raster', source: id, paint: { 'raster-opacity': layer.opacity } });
      continue;
    }
    style.sources[id] = {
      type: 'vector',
      tiles: [vectorTileUrl(layer.key, layer.tiles)],
      minzoom: layer.minzoom,
      maxzoom: layer.maxzoom,
      ...(layer.bounds ? { bounds: layer.bounds } : {}),
    };
    // MapLibre only loads a source that a layer draws; generated layers wait for the names the tiles carry.
    style.layers.push({ id: `${layer.key}::probe`, type: 'fill', source: id, 'source-layer': '__probe__' });
    if (layer.style) {
      const applied = ((layer.style.document.layers as LayerSpecification[] | undefined) ?? []).filter(
        (styleLayer) =>
          'source' in styleLayer &&
          styleLayer.source === layer.style!.source &&
          // Text needs glyphs; a style without them would fail validation as a whole.
          (style.glyphs || !(styleLayer.type === 'symbol' && styleLayer.layout?.['text-field']))
      );
      style.layers.push(
        ...applied.map(
          (styleLayer) => ({ ...styleLayer, id: `${layer.key}::${styleLayer.id}`, source: id }) as LayerSpecification
        )
      );
    } else {
      for (const sourceLayer of sourceLayersOf(layer.key)) {
        style.layers.push(...generatedLayers(layer.key, sourceLayer, layer.opacity));
      }
    }
  }
  Object.assign(style.sources, overlay.sources);
  style.layers.push(...overlay.layers);
  return style;
}
