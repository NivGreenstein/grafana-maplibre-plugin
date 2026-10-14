import { setWorldCRS } from '@nivgreen/maplibre-gl-js-crs84';
import type { WorldCrs } from '../geo/types';

// The fork's world CRS is process-wide, so every panel of this plugin on the page shares one.
// The first live map sets it; a lone map may switch it, since no other map depends on it.
const live = new Map<string, WorldCrs>();
const listeners = new Map<string, () => void>();
let active: WorldCrs | null = null;

export function acquireWorldCrs(key: string, wanted: WorldCrs, onLone: () => void): WorldCrs {
  live.set(key, wanted);
  listeners.set(key, onLone);
  if (live.size === 1 && active !== wanted) {
    setWorldCRS(wanted);
    active = wanted;
  }
  return active ?? wanted;
}

export function releaseWorldCrs(key: string) {
  live.delete(key);
  listeners.delete(key);
  if (!live.size) {
    return;
  }
  // A map left alone that wanted the other CRS can now rebuild in it.
  if (live.size === 1) {
    const [[lastKey, wanted]] = [...live.entries()];
    if (wanted !== active) {
      listeners.get(lastKey)?.();
    }
  }
}

export const activeWorldCrs = () => active;
