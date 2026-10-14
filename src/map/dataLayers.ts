import { FieldType, getFieldDisplayName, type DataFrame, type Field, type GrafanaTheme2 } from '@grafana/data';
import type { LayerSpecification } from '@nivgreen/maplibre-gl-js-crs84';
import type { Bounds } from '../geo/crs';
import type { DataLayer } from '../types';
import type { Overlay } from './style';

export const dataLayerPrefix = 'data:';

type Point = { lon: number; lat: number; frame: number; row: number };

const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function decodeGeohash(hash: string): [number, number] | undefined {
  let even = true;
  const lat = [-90, 90];
  const lon = [-180, 180];
  for (const char of hash.toLowerCase()) {
    const value = base32.indexOf(char);
    if (value < 0) {
      return undefined;
    }
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lon : lat;
      const mid = (range[0] + range[1]) / 2;
      range[(value >> bit) & 1 ? 0 : 1] = mid;
      even = !even;
    }
  }
  return [(lon[0] + lon[1]) / 2, (lat[0] + lat[1]) / 2];
}

const fieldByName = (frame: DataFrame, name: string | undefined) =>
  name ? frame.fields.find((field) => getFieldDisplayName(field, frame) === name || field.name === name) : undefined;
const fieldMatching = (frame: DataFrame, pattern: RegExp) => frame.fields.find((field) => pattern.test(field.name));

// Finds each row's position from lat/lon fields or a geohash, like Geomap's location modes.
export function framePoints(frame: DataFrame, frameIndex: number, location: DataLayer['location']): Point[] {
  let latitude: Field | undefined;
  let longitude: Field | undefined;
  let geohash: Field | undefined;
  if (location.mode === 'coords') {
    latitude = fieldByName(frame, location.latitude);
    longitude = fieldByName(frame, location.longitude);
  } else if (location.mode === 'geohash') {
    geohash = fieldByName(frame, location.geohash);
  } else {
    latitude = fieldMatching(frame, /^(lat|latitude)$/i);
    longitude = fieldMatching(frame, /^(lon|lng|long|longitude)$/i);
    geohash = latitude && longitude ? undefined : fieldMatching(frame, /geohash/i);
  }
  const points: Point[] = [];
  for (let row = 0; row < frame.length; row++) {
    let lon: number | undefined;
    let lat: number | undefined;
    if (latitude && longitude) {
      lat = Number(latitude.values[row]);
      lon = Number(longitude.values[row]);
    } else if (geohash) {
      [lon, lat] = decodeGeohash(String(geohash.values[row] ?? '')) ?? [];
    }
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180) {
      points.push({ lon: lon!, lat: lat!, frame: frameIndex, row });
    }
  }
  return points;
}

function scaler(frames: DataFrame[], name: string | undefined) {
  const values = frames.flatMap((frame) => {
    const field = fieldByName(frame, name);
    return field?.type === FieldType.number ? field.values.map(Number).filter(Number.isFinite) : [];
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (frame: DataFrame, row: number) => {
    const field = fieldByName(frame, name);
    const value = Number(field?.values[row]);
    if (!field || !Number.isFinite(value)) {
      return undefined;
    }
    return max > min ? (value - min) / (max - min) : 1;
  };
}

export type DataOverlay = Overlay & { bounds?: Bounds };

export function buildDataOverlay(layers: DataLayer[], frames: DataFrame[], theme: GrafanaTheme2): DataOverlay {
  const overlay: DataOverlay = { sources: {}, layers: [] };
  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  for (const layer of layers) {
    if (layer.visible === false) {
      continue;
    }
    const indexed = frames.map((frame, index) => ({ frame, index }));
    const picked = indexed.filter(({ frame }) => !layer.query || frame.refId === layer.query);
    const pickedFrames = picked.map(({ frame }) => frame);
    const size = scaler(pickedFrames, layer.markers.sizeField);
    const weight = scaler(pickedFrames, layer.heatmap.weightField);
    const fixedColor = theme.visualization.getColorByName(layer.markers.color || 'green');
    const features = picked.flatMap(({ frame, index }) => {
      const colorField = fieldByName(frame, layer.markers.colorField);
      return framePoints(frame, index, layer.location).map((point) => {
        west = Math.min(west, point.lon);
        east = Math.max(east, point.lon);
        south = Math.min(south, point.lat);
        north = Math.max(north, point.lat);
        const scaled = size(frame, point.row);
        const color = colorField?.display ? colorField.display(colorField.values[point.row]).color : undefined;
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [point.lon, point.lat] },
          properties: {
            frame: point.frame,
            row: point.row,
            color: color ?? fixedColor,
            size:
              scaled === undefined
                ? layer.markers.size
                : layer.markers.minSize + scaled * (layer.markers.maxSize - layer.markers.minSize),
            weight: weight(frame, point.row) ?? 1,
          },
        };
      });
    });
    const id = `${dataLayerPrefix}${layer.id}`;
    overlay.sources[id] = { type: 'geojson', data: { type: 'FeatureCollection', features } };
    overlay.layers.push(
      layer.type === 'heatmap'
        ? ({
            id,
            type: 'heatmap',
            source: id,
            paint: {
              'heatmap-weight': ['get', 'weight'],
              'heatmap-radius': layer.heatmap.radius,
              'heatmap-intensity': layer.heatmap.intensity,
              'heatmap-opacity': layer.heatmap.opacity,
            },
          } as LayerSpecification)
        : ({
            id,
            type: 'circle',
            source: id,
            paint: {
              'circle-radius': ['get', 'size'],
              'circle-color': ['get', 'color'],
              'circle-opacity': layer.markers.opacity,
              'circle-stroke-color': ['get', 'color'],
              'circle-stroke-width': 1,
            },
          } as LayerSpecification)
    );
  }
  if (west <= east && south <= north) {
    overlay.bounds = [west, south, east, north];
  }
  return overlay;
}

export const defaultDataLayer = (id: string): DataLayer => ({
  id,
  name: 'Markers',
  type: 'markers',
  visible: true,
  location: { mode: 'auto' },
  markers: { color: 'green', size: 6, minSize: 3, maxSize: 15, opacity: 0.8 },
  heatmap: { radius: 20, intensity: 1, opacity: 0.8 },
});
