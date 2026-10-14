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

## Install on your Grafana

Requirements: Grafana 13.2 or later. Each [GitHub release](https://github.com/NivGreenstein/grafana-maplibre-plugin/releases)
has the packaged plugin attached as `nivgreen-maplibre-panel-<version>.zip`. You can also build the zip yourself with
`npm run package`, which writes it to `artifacts/`.

Grafana refuses unsigned plugins by default. Until the plugin is signed (see [Signing](#signing)), allow this one plugin
by ID. Every method below needs that setting, followed by a Grafana restart.

```ini
# grafana.ini
[plugins]
allow_loading_unsigned_plugins = nivgreen-maplibre-panel
```

or `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=nivgreen-maplibre-panel` as an environment variable.

### From the release URL

Grafana downloads and installs the zip when it starts:

```ini
[plugins]
preinstall_sync = nivgreen-maplibre-panel@1.0.0@https://github.com/NivGreenstein/grafana-maplibre-plugin/releases/download/v1.0.0/nivgreen-maplibre-panel-1.0.0.zip
allow_loading_unsigned_plugins = nivgreen-maplibre-panel
```

With Docker, set the same values through environment variables:

```bash
docker run -d -p 3000:3000 \
  -e GF_PLUGINS_PREINSTALL_SYNC="nivgreen-maplibre-panel@1.0.0@https://github.com/NivGreenstein/grafana-maplibre-plugin/releases/download/v1.0.0/nivgreen-maplibre-panel-1.0.0.zip" \
  -e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=nivgreen-maplibre-panel \
  grafana/grafana:13.2.3
```

With the Grafana Helm chart, put both variables under `env:` in `values.yaml`.

### With grafana cli

```bash
grafana cli --pluginUrl https://github.com/NivGreenstein/grafana-maplibre-plugin/releases/download/v1.0.0/nivgreen-maplibre-panel-1.0.0.zip \
  plugins install nivgreen-maplibre-panel
```

### By hand (air-gapped servers)

Unzip the archive into Grafana's plugins directory (`/var/lib/grafana/plugins` by default). This gives you
`/var/lib/grafana/plugins/nivgreen-maplibre-panel/plugin.json`.

After restarting, check **Administration > Plugins and data > Plugins** for **MapLibre CRS84**, then add it to a
dashboard as a visualization.

The tile, WMTS, CSW and OGC API services must allow CORS requests from your Grafana's origin, because the browser
fetches them directly.

## Signing

A signed plugin loads without `allow_loading_unsigned_plugins`. Signing needs a Grafana Cloud account and an Access
Policy token with the `plugins:write` scope. For how to create one, see
[Sign a plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin).

- **Private** (your own Grafana servers only): the signature is bound to the URLs Grafana is served from.

  ```bash
  GRAFANA_ACCESS_POLICY_TOKEN=<token> ROOT_URLS=https://grafana.example.com npm run package
  ```

- **Public** (the Grafana plugin catalog): submit the plugin for review on grafana.com first. The plugin ID's
  `nivgreen` prefix must match your grafana.com organization. Once it is approved, sign without `ROOT_URLS`.

In CI, set the `GRAFANA_ACCESS_POLICY_TOKEN` secret, and for a private signature the `GRAFANA_ROOT_URLS` variable, under
the repository's **Settings > Secrets and variables > Actions**. Every build and release is then signed.

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
npm run package    # build and zip into artifacts/<id>-<version>.zip
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

## Releases

Releases are cut by [release-please](https://github.com/googleapis/release-please) from the Conventional Commits on `main`:

1. Each push to `main` updates a release PR. It bumps the version in `package.json` and adds the changes to
   `CHANGELOG.md`.
2. Merging that PR tags `v<version>` and creates the GitHub release.
3. The release workflow then runs the [build workflow](.github/workflows/build.yml) and attaches
   `nivgreen-maplibre-panel-<version>.zip` to the release.

`feat` commits bump the minor version, `fix` commits the patch, and `feat!` or a `BREAKING CHANGE` footer the major.

The build workflow also runs on every push and pull request (through `ci.yml`). It typechecks, lints, runs the unit
tests, packages the plugin and validates the zip, and the e2e tests run against that build.

Optional repository secrets:

- `GH_PAT`: a personal access token for release-please. With the default token, the release PR does not trigger the CI
  workflows.
- `GRAFANA_ACCESS_POLICY_TOKEN`: signs the package (see [Signing](#signing)).
