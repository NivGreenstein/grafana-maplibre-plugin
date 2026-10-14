// Ported from https://github.com/NivGreenstein/ogc-tiles-viewer (src/MapLibreView.tsx).
import type { AddProtocolAction } from '@nivgreen/maplibre-gl-js-crs84';
import type { Fetcher } from './types';

// MVT tiles are fetched through this protocol so the source-layer names inside them can be read:
// MapLibre only draws a source-layer that a style layer names, and a template does not list them.
export const vectorProtocol = 'mvt-names';

type Entry = { fetcher: Fetcher; names: Set<string>; onNames: () => void };
const entries = new Map<string, Entry>();

export function registerVector(key: string, fetcher: Fetcher, onNames: () => void) {
  const existing = entries.get(key);
  entries.set(key, { fetcher, names: existing?.names ?? new Set(), onNames });
}

export function unregisterVector(prefix: string) {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) {
      entries.delete(key);
    }
  }
}

export const sourceLayersOf = (key: string) => [...(entries.get(key)?.names ?? [])];

export const vectorTileUrl = (key: string, template: string) =>
  `${vectorProtocol}://${encodeURIComponent(key)}@${template}`;

export function mvtLayerNames(bytes: Uint8Array) {
  let position = 0;
  const varint = () => {
    let value = 0;
    for (let shift = 0; position < bytes.length; shift += 7) {
      const byte = bytes[position++];
      value += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) {
        break;
      }
    }
    return value;
  };
  // Walks the fields in [position, end), handing each length-delimited one to `onField`.
  const fields = (end: number, onField: (field: number, start: number, length: number) => void) => {
    while (position < end) {
      const key = varint();
      const wire = key & 7;
      if (wire === 2) {
        const length = varint();
        const start = position;
        position += length;
        onField(key >> 3, start, length);
      } else if (wire === 0) {
        varint();
      } else if (wire === 1) {
        position += 8;
      } else if (wire === 5) {
        position += 4;
      } else {
        break;
      }
    }
  };
  const names: string[] = [];
  fields(bytes.length, (field, start, length) => {
    if (field !== 3) {
      return;
    }
    const after = position;
    position = start;
    fields(start + length, (layerField, nameStart, nameLength) => {
      if (layerField === 1) {
        names.push(new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength)));
      }
    });
    position = after;
  });
  return names;
}

export const vectorLoader: AddProtocolAction = async ({ url }, abortController) => {
  const rest = url.slice(vectorProtocol.length + 3);
  const separator = rest.indexOf('@');
  const entry = entries.get(decodeURIComponent(rest.slice(0, separator)));
  if (!entry) {
    throw new Error('This vector source is no longer on the map.');
  }
  const response = await entry.fetcher(rest.slice(separator + 1), { signal: abortController.signal });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  let data = await response.arrayBuffer();
  let bytes = new Uint8Array(data);
  // A tile stored gzipped but served without Content-Encoding reaches the browser still compressed.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
    data = await new Response(stream).arrayBuffer();
    bytes = new Uint8Array(data);
  }
  const added = mvtLayerNames(bytes).filter((name) => !entry.names.has(name));
  if (added.length) {
    added.forEach((name) => entry.names.add(name));
    entry.onNames();
  }
  return { data };
};
