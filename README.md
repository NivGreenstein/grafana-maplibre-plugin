# grafana-maplibre-plugin

A Grafana panel plugin (`nivgreen-maplibre-panel`) that draws maps with
[`@nivgreen/maplibre-gl-js-crs84`](https://github.com/nivGreenstein/maplibre-gl-js), a MapLibre GL JS fork for the OGC
WorldCRS84Quad (EPSG:4326) tile matrix set. The panel draws:

- direct raster and MVT tile templates
- WMTS capabilities
- MapColonies CSW raster catalogs
- OGC API Tiles
- Grafana query results, as markers or a heatmap

User documentation is in [src/README.md](src/README.md), which Grafana shows on the plugin's page.

The WMTS, CSW, OGC API, regrid and MVT handling is ported from
[ogc-tiles-viewer](https://github.com/NivGreenstein/ogc-tiles-viewer).

## Development

Requirements: Node.js 22 or later, and Docker.

```bash
npm install
npm run dev        # build in watch mode
npm run server     # Grafana with the plugin and provisioned dashboards at http://localhost:3000
npm run test:ci    # unit tests (Jest)
npm run e2e        # end-to-end tests (Playwright), against the running server
npm run typecheck && npm run lint
npm run build      # production build into dist/
```

Set `GRAFANA_URL` when the server is not on port 3000, for example `GRAFANA_URL=http://localhost:3300 npm run e2e`.

The provisioned dashboards **MapLibre · EPSG:4326** and **MapLibre · EPSG:3857** draw NASA GIBS, OpenStreetMap and
TestData points. The 3857 dashboard also has a panel that wants 4326, which shows the shared-CRS warning.

### Layout

```text
src/module.ts                  Panel plugin and options
src/components/MapPanel.tsx    Map lifecycle, style updates, fit, tooltips
src/editors/                   Sources, data layers and request headers editors
src/map/worldCrs.ts            The page-wide world CRS shared by every map
src/map/setup.ts               Worker URL, RTL text plugin, tile protocols (once per page)
src/map/sources.ts             Resolves option sources into MapLibre sources
src/map/style.ts               Builds the MapLibre style
src/map/dataLayers.ts          Query results as GeoJSON markers or a heatmap
src/map/headers.ts             Per-panel request headers
src/geo/                       WMTS, CSW, OGC API, CRS recognition, regrid, MVT layer names
webpack.config.ts              Copies MapLibre's module worker and the RTL plugin into dist/
```

MapLibre v6 runs its worker as an ES module next to the main bundle. `webpack.config.ts` copies
`maplibre-gl-worker.mjs` and the `maplibre-gl-shared.mjs` chunk it imports into `dist/`, and `src/map/setup.ts` points
`setWorkerUrl` at them under the plugin's public path.

### Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), and commitlint checks them in a
husky `commit-msg` hook. The `pre-commit` hook runs the typecheck and lint.
