# MapLibre CRS84 panel

A Grafana map panel drawn by [`@nivgreen/maplibre-gl-js-crs84`](https://www.npmjs.com/package/@nivgreen/maplibre-gl-js-crs84). This MapLibre GL JS fork works natively in the OGC **WorldCRS84Quad** tile matrix set (EPSG:4326). It can also work in **WebMercatorQuad** (EPSG:3857).

## Features

- **Projection:** EPSG:4326 or EPSG:3857, chosen per panel. EPSG:4326 rasters are reprojected to Web Mercator in the browser with [`@nivgreen/maplibre-gl-raster-reprojection`](https://www.npmjs.com/package/@nivgreen/maplibre-gl-raster-reprojection).
- **Tile sources**, stacked in order with the first at the bottom:
  - **Raster tile template:** `…/{z}/{x}/{y}.png` in EPSG:4326 or EPSG:3857.
  - **WMTS capabilities:** load the document and pick its layers. EPSG:4326 matrix sets that are not WorldCRS84Quad, such as NASA GIBS' 512 px tiles, are resampled onto the map grid.
  - **MapColonies CSW:** pages through the `mc:MCRasterRecord` raster catalog. Each record's `WMTS` link supplies the capabilities and layer.
  - **Vector tile template (MVT):** EPSG:4326 or EPSG:3857, drawn with an optional MapLibre style URL. Without one, features are colored by geometry type.
  - **OGC API Tiles:** discovers vector tilesets from a landing page by following its advertised links.
- **Data layers:** query results drawn as **markers** or a **heatmap**, like Geomap.
  - Location comes from latitude/longitude fields (found automatically or picked) or from a geohash field.
  - Marker color comes from the field's color scheme and thresholds (Standard options), and size from a numeric field.
  - Tooltips show the row under the cursor, on hover or on click.
- **Request headers:** Postman-style header rows, such as `x-api-key`, sent with every tile, capabilities and catalog request. They can be limited to one host, and values may use dashboard variables such as `${api_key}`.

## One projection per dashboard

The fork's world CRS is a page-wide setting, so every map of this panel on a dashboard is drawn in the same projection. The first map shown sets it. A panel set to the other projection shows a warning and is drawn in the shared one. Rasters in EPSG:4326 are reprojected when that is Web Mercator.

Vector tiles and EPSG:3857 rasters cannot be reprojected. A panel that needs them in the other projection reports an error for that source.

## Request headers and secrets

Header rows are stored in the dashboard JSON, so anyone who can view the dashboard JSON can read them. To keep a value out of the panel options, put it in a dashboard variable (for example a hidden constant) and write `${variable}` as the value.

A custom header makes cross-origin requests preflighted. The tile service must list the header in `Access-Control-Allow-Headers`, or the requests fail. Give the header a host so it is only sent where it is accepted.

The reprojection plugin fetches its source tiles itself. Those requests get headers through a `fetch` wrapper that only touches URLs under a reprojected source's tile template, so Grafana's own requests are never changed. If two panels reproject the same URL with different header values, the last panel loaded wins.

## Requirements

- Grafana 13.2 or later.
- Tile services must allow CORS requests from the Grafana origin, because tiles are fetched by the browser.
