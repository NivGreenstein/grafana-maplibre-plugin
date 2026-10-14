import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2, PanelProps } from '@grafana/data';
import { Alert, Button, IconButton, Stack, Toggletip, useStyles2, useTheme2 } from '@grafana/ui';
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type LngLatBoundsLike,
  type MapGeoJSONFeature,
} from '@nivgreen/maplibre-gl-js-crs84';
import { quadLabel, type Bounds } from '../geo/crs';
import { unregisterRegrid } from '../geo/regrid';
import type { WorldCrs } from '../geo/types';
import { registerVector, unregisterVector } from '../geo/vectorProtocol';
import { buildDataOverlay, dataLayerPrefix } from '../map/dataLayers';
import { headersFor, interpolateHeaders, makeFetcher, unregisterFetchPrefixes } from '../map/headers';
import { setupMapLibre } from '../map/setup';
import { mercatorLatitude, resolveSources, type Resolved } from '../map/sources';
import { buildStyle } from '../map/style';
import { acquireWorldCrs, releaseWorldCrs } from '../map/worldCrs';
import type { MapOptions } from '../types';
import { Tooltip, type Hover } from './Tooltip';

type Props = PanelProps<MapOptions>;

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({ position: 'relative', overflow: 'hidden' }),
  // MapLibre's CSS makes the container position: relative, so it is sized explicitly.
  badge: css({
    position: 'absolute',
    left: theme.spacing(1),
    bottom: theme.spacing(1),
    padding: theme.spacing(0.25, 0.75),
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.secondary,
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    pointerEvents: 'none',
  }),
  // Kept inside the panel so the close button stays reachable.
  messages: css({
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(1),
    left: theme.spacing(1),
    maxHeight: `calc(100% - ${theme.spacing(2)})`,
    display: 'flex',
    justifyContent: 'flex-end',
    zIndex: 2,
    '& > div': { maxWidth: 480, maxHeight: '100%', overflowY: 'auto', overflowWrap: 'anywhere', margin: 0 },
  }),
  compact: css({
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(1),
    zIndex: 2,
    background: theme.colors.background.primary,
    borderRadius: theme.shape.radius.default,
  }),
  messageList: css({ maxWidth: 320, overflowWrap: 'anywhere' }),
});

const clampBounds = (bounds: Bounds, worldCrs: WorldCrs): LngLatBoundsLike => {
  const edge = worldCrs === 'WebMercatorQuad' ? mercatorLatitude : 90;
  return [bounds[0], Math.max(bounds[1], -edge), bounds[2], Math.min(bounds[3], edge)];
};

const unionBounds = (all: Array<Bounds | undefined>): Bounds | undefined =>
  all.reduce<Bounds | undefined>(
    (sum, next) =>
      !next
        ? sum
        : !sum
          ? next
          : [
              Math.min(sum[0], next[0]),
              Math.min(sum[1], next[1]),
              Math.max(sum[2], next[2]),
              Math.max(sum[3], next[3]),
            ],
    undefined
  );

export const MapPanel: React.FC<Props> = ({ options, data, width, height, replaceVariables }) => {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const [instance] = useState(() => `p${Math.random().toString(36).slice(2, 10)}`);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Set once a map has loaded; a new map gets a new version.
  const [ready, setReady] = useState<{ version: number; crs: WorldCrs } | null>(null);
  const mapVersion = ready?.version ?? 0;
  const activeCrs = ready?.crs ?? null;
  const [epoch, rebuild] = useReducer((n: number) => n + 1, 0);
  const [namesVersion, namesChanged] = useReducer((n: number) => n + 1, 0);
  const [resolved, setResolved] = useState<Resolved[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [tileErrors, setTileErrors] = useState<string[]>([]);
  const [hover, setHover] = useState<Hover | null>(null);

  const headers = useMemo(
    () => interpolateHeaders(options.headers ?? [], (value) => replaceVariables(value)),
    [options.headers, replaceVariables]
  );
  const headersRef = useRef(headers);
  // Source titles by key, for tile error messages.
  const titlesRef = useRef(new Map<string, string>());
  useEffect(() => {
    headersRef.current = headers;
  }, [headers]);
  const fetcher = useMemo(() => makeFetcher(headers), [headers]);

  // The map is rebuilt when the world CRS changes, since the fork bakes it into tile coordinates.
  useEffect(() => {
    setupMapLibre();
    const crs = acquireWorldCrs(instance, options.projection, rebuild);
    const view = options.view;
    const map = new MapLibreMap({
      container: container.current!,
      center: view?.mode === 'coords' ? [view.longitude, view.latitude] : [0, 0],
      zoom: view?.mode === 'coords' ? view.zoom : 1,
      attributionControl: false,
      style: { version: 8, sources: {}, layers: [] },
      // Worker requests bypass the page's fetch, so they get the headers here.
      transformRequest: (url) => {
        const extra = headersFor(url, headersRef.current);
        return extra.length ? { url, headers: Object.fromEntries(extra) } : { url };
      },
    });
    const reported = new Set<string>();
    map.on('error', (event) => {
      const id = (event as { sourceId?: string }).sourceId ?? 'map';
      // One message per source is enough to explain an empty area.
      if (!reported.has(id)) {
        reported.add(id);
        const title = titlesRef.current.get(id.replace(/^src:/, '')) ?? id;
        const detail = event.error?.message ?? String(event.error);
        setTileErrors((list) => [...list, `${title}: tile request failed (${detail})`]);
      }
    });
    mapRef.current = map;
    map.once('load', () => setReady((last) => ({ version: (last?.version ?? 0) + 1, crs })));
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(null);
      releaseWorldCrs(instance);
      setTileErrors([]);
    };
  }, [instance, options.projection, epoch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      unregisterVector(instance);
      unregisterRegrid(instance);
      unregisterFetchPrefixes(instance);
    },
    [instance]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const controls = [
      options.showZoom !== false && new NavigationControl({ showCompass: false }),
      options.showScale && new ScaleControl({ unit: 'metric' }),
    ].filter((control): control is NavigationControl | ScaleControl => Boolean(control));
    controls.forEach((control) =>
      map.addControl(control, control instanceof ScaleControl ? 'bottom-right' : 'top-left')
    );
    return () => {
      // map.remove() already detached them when the map itself is gone.
      if (mapRef.current === map) {
        controls.forEach((control) => map.removeControl(control));
      }
    };
  }, [mapVersion, options.showZoom, options.showScale]);

  useEffect(() => {
    mapRef.current?.resize();
  }, [width, height]);

  // Catalogs and capabilities are read again whenever the sources, headers or CRS change.
  useEffect(() => {
    if (!activeCrs) {
      return;
    }
    let cancelled = false;
    const replace = (value: string) => replaceVariables(value);
    resolveSources({ instance, worldCrs: activeCrs, fetcher, headers, replace }, options.sources ?? []).then(
      (result) => {
        if (cancelled) {
          return;
        }
        result.layers
          .filter((layer) => layer.kind === 'vector')
          .forEach((layer) => registerVector(layer.key, fetcher, namesChanged));
        titlesRef.current = new Map(result.layers.map((layer) => [layer.key, layer.title]));
        setResolved(result.layers);
        setErrors(result.errors);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [instance, activeCrs, fetcher, headers, options.sources, replaceVariables, mapVersion]);

  const overlay = useMemo(
    () => buildDataOverlay(options.dataLayers ?? [], data.series, theme),
    [options.dataLayers, data.series, theme]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    map.setStyle(buildStyle(resolved, overlay), { diff: true });
    map.showTileBoundaries = Boolean(options.tileDebug);
  }, [resolved, overlay, namesVersion, mapVersion, options.tileDebug]);

  // Fit to the data, or to the layers when there is none; a fixed view is applied when it changes.
  const fitTarget = useMemo(
    () => overlay.bounds ?? unionBounds(resolved.map((layer) => layer.bounds)),
    [overlay.bounds, resolved]
  );
  const view = options.view;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeCrs) {
      return;
    }
    if (view?.mode === 'coords') {
      map.jumpTo({ center: [view.longitude, view.latitude], zoom: view.zoom });
    } else if (fitTarget) {
      map.fitBounds(clampBounds(fitTarget, activeCrs), { padding: 30, duration: 0, maxZoom: 16 });
    }
  }, [mapVersion, activeCrs, view?.mode, view?.latitude, view?.longitude, view?.zoom, fitTarget]);

  // Data-layer tooltips, on hover or click.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || options.tooltip === 'none') {
      setHover(null);
      return;
    }
    const pick = (event: { point: { x: number; y: number } }) => {
      const layers = (options.dataLayers ?? [])
        .map((layer) => `${dataLayerPrefix}${layer.id}`)
        .filter((id) => map.getLayer(id));
      const features: MapGeoJSONFeature[] = layers.length
        ? map.queryRenderedFeatures([event.point.x, event.point.y], { layers })
        : [];
      const hits = features
        .filter((feature) => feature.layer.type === 'circle')
        .map((feature) => ({ frame: Number(feature.properties.frame), row: Number(feature.properties.row) }));
      setHover(hits.length ? { x: event.point.x, y: event.point.y, hits } : null);
      map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
    };
    const type = options.tooltip === 'click' ? 'click' : 'mousemove';
    map.on(type, pick);
    const leave = () => setHover(null);
    map.on('mouseout', leave);
    return () => {
      map.off(type, pick);
      map.off('mouseout', leave);
    };
  }, [mapVersion, options.tooltip, options.dataLayers]);

  const messages = [
    activeCrs && activeCrs !== options.projection
      ? `Another map on this dashboard uses ${quadLabel[activeCrs]}. MapLibre's world CRS is shared by every map on the page, so this map is drawn in it too.`
      : '',
    ...errors,
    ...tileErrors,
  ].filter(Boolean);
  // Closing hides the messages shown; a new or changed message shows again.
  const messageKey = messages.join('\n');
  const [dismissed, setDismissed] = useState('');
  const small = width < 360 || height < 200;

  return (
    <div className={styles.wrapper} style={{ width, height }}>
      <div
        ref={container}
        style={{ width, height, background: theme.visualization.getColorByName(options.background ?? 'white') }}
      />
      {activeCrs && <div className={styles.badge}>{quadLabel[activeCrs]}</div>}
      {messages.length > 0 &&
        messageKey !== dismissed &&
        (small ? (
          // A small panel shows a button that opens the messages, so the map stays visible.
          <div className={styles.compact}>
            <Toggletip
              title="Map"
              closeButton={false}
              content={
                <Stack direction="column" gap={1}>
                  <div className={styles.messageList}>
                    {messages.map((message) => (
                      <div key={message}>{message}</div>
                    ))}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setDismissed(messageKey)}>
                    Dismiss
                  </Button>
                </Stack>
              }
            >
              <IconButton
                name="exclamation-triangle"
                variant="secondary"
                tooltip={`${messages.length} map message(s)`}
              />
            </Toggletip>
          </div>
        ) : (
          <div className={styles.messages}>
            <Alert severity="warning" title="Map" onRemove={() => setDismissed(messageKey)}>
              {messages.map((message) => (
                <div key={message}>{message}</div>
              ))}
            </Alert>
          </div>
        ))}
      {hover && <Tooltip hover={hover} frames={data.series} />}
    </div>
  );
};
