import { addProtocol, getRTLTextPluginStatus, setRTLTextPlugin, setWorkerUrl } from '@nivgreen/maplibre-gl-js-crs84';
import { createProtocol, epsg4326ToEpsg3857Presets } from '@nivgreen/maplibre-gl-raster-reprojection';
import '@nivgreen/maplibre-gl-js-crs84/dist/maplibre-gl.css';
import { regridLoader, regridProtocol } from '../geo/regrid';
import { vectorLoader, vectorProtocol } from '../geo/vectorProtocol';

declare const __webpack_public_path__: string;

// EPSG:4326 raster tiles are drawn on a Web Mercator map by reprojecting them in the browser.
export const reprojection = createProtocol({ ...epsg4326ToEpsg3857Presets });

let done = false;

// Runs once per page: the worker, the RTL text plugin and the tile protocols are global in MapLibre.
export function setupMapLibre() {
  if (done) {
    return;
  }
  done = true;
  // webpack copies these next to module.js (see webpack.config.ts).
  const base = new URL(__webpack_public_path__, globalThis.location.href).href;
  setWorkerUrl(`${base}maplibre-gl-worker.mjs`);
  if (getRTLTextPluginStatus() === 'unavailable') {
    void setRTLTextPlugin(`${base}mapbox-gl-rtl-text.js`, true);
  }
  addProtocol(vectorProtocol, vectorLoader);
  addProtocol(regridProtocol, regridLoader);
  addProtocol(reprojection.protocol, reprojection.loader);
}
