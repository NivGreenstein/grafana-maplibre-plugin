// Ported from https://github.com/NivGreenstein/ogc-tiles-viewer (src/ogc.ts), without the OpenLayers projection parts.
import { absolute, fetchJson } from './http';
import type { Fetcher, Link, MatrixSet, Tileset } from './types';

const tilesetRels = [
  'http://www.opengis.net/def/rel/ogc/1.0/tilesets',
  'tilesets',
  'http://www.opengis.net/def/rel/ogc/1.0/tilesets-vector',
  'tilesets-vector',
];

export const byRel = (links: Link[], rels: string[]) => links.find((link) => rels.includes(link.rel ?? ''));
const linksOf = (value: Record<string, unknown>) => (value.links as Link[] | undefined) ?? [];

function withTileFormat(template: string, format: string) {
  const url = new URL(template);
  url.searchParams.set('f', format);
  return url.toString().replace(/%7B/gi, '{').replace(/%7D/gi, '}');
}

function parseTileset(raw: Record<string, unknown>, base: string, fallbackTitle?: string): Tileset {
  const bbox = raw.boundingBox as Record<string, unknown> | undefined;
  const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const uri = str(raw.tileMatrixSetURI) ?? str(raw.tileMatrixSetDefinition);
  const tileMatrixSetId = str(raw.tileMatrixSetId) ?? uri?.split(/[/#]/).filter(Boolean).pop()?.replace(/\?.*$/, '');
  const self = byRel(linksOf(raw), ['self']);
  const title = str(raw.title) ?? fallbackTitle ?? str(raw.id) ?? 'Untitled tileset';
  return {
    // A collection is usually listed once per tile matrix set with the same title and no id, so the self link
    // tells them apart.
    id: self ? absolute(self.href, base) : `${str(raw.id) ?? title}@${tileMatrixSetId ?? base}`,
    title,
    description: str(raw.description),
    dataType: str(raw.dataType),
    crs: str(raw.crs),
    tileMatrixSetId,
    boundingBox: bbox
      ? {
          lowerLeft: (bbox.lowerLeft as number[]) ?? [],
          upperRight: (bbox.upperRight as number[]) ?? [],
          crs: str(bbox.crs),
        }
      : undefined,
    links: linksOf(raw).map((link) => ({ ...link, href: absolute(link.href, base) })),
  };
}

// Follows the landing page's advertised links to its vector tilesets; no endpoint paths are guessed.
export async function discover(fetcher: Fetcher, endpoint: string) {
  const landing = await fetchJson(fetcher, endpoint);
  const links = linksOf(landing);
  const serviceDescription = byRel(links, ['service-desc']);
  let tileFormats: string[] = [];
  if (serviceDescription) {
    try {
      const api = await fetchJson(fetcher, absolute(serviceDescription.href, endpoint));
      const parameters = (api.components as Record<string, unknown> | undefined)?.parameters as
        Record<string, Record<string, unknown>> | undefined;
      const schema = parameters?.fTile?.schema as Record<string, unknown> | undefined;
      tileFormats = ((schema?.enum as unknown[] | undefined) ?? []).filter(
        (format): format is string => typeof format === 'string'
      );
    } catch {
      // The OpenAPI document is optional.
    }
  }
  const tilesetsLink = byRel(links, tilesetRels);
  const collectionUrls = links
    .filter((link) => link.rel === 'item' || link.rel === 'collection')
    .map((link) => absolute(link.href, endpoint));
  const dataLink = byRel(links, ['data']);
  const sets: Tileset[] = [];
  if (tilesetsLink) {
    const catalogUrl = absolute(tilesetsLink.href, endpoint);
    const catalog = await fetchJson(fetcher, catalogUrl);
    sets.push(
      ...((catalog.tilesets as Array<Record<string, unknown>> | undefined) ?? []).map((raw) =>
        parseTileset(raw, catalogUrl)
      )
    );
  }
  if (dataLink) {
    const collectionsUrl = absolute(dataLink.href, endpoint);
    const collections = await fetchJson(fetcher, collectionsUrl);
    for (const collection of (collections.collections as Array<Record<string, unknown>> | undefined) ?? []) {
      const self = byRel(linksOf(collection), ['self']);
      if (self) {
        collectionUrls.push(absolute(self.href, collectionsUrl));
      }
    }
  }
  if (!sets.length) {
    for (const collectionUrl of collectionUrls) {
      try {
        const collection = await fetchJson(fetcher, collectionUrl);
        const tilesLink = byRel(linksOf(collection), tilesetRels);
        if (tilesLink) {
          const tilesUrl = absolute(tilesLink.href, collectionUrl);
          const catalog = await fetchJson(fetcher, tilesUrl);
          sets.push(
            ...((catalog.tilesets as Array<Record<string, unknown>> | undefined) ?? []).map((raw) =>
              parseTileset(raw, tilesUrl, typeof collection.title === 'string' ? collection.title : undefined)
            )
          );
        }
      } catch {
        // One unreadable collection does not hide the others.
      }
    }
  }
  return sets
    .filter((set) => !set.dataType || set.dataType.toLowerCase() === 'vector')
    .map((set) =>
      tileFormats.length
        ? {
            ...set,
            links: set.links.flatMap((link) =>
              link.rel === 'item' && link.templated
                ? tileFormats.map((format) => ({
                    ...link,
                    href: withTileFormat(link.href, format),
                    type: link.type ?? `application/x-${format}`,
                    title: format.toUpperCase(),
                  }))
                : [link]
            ),
          }
        : set
    );
}

// The tile URL template a tileset advertises, preferring Mapbox vector tiles.
export function tileTemplateOf(links: Link[]) {
  const items = links.filter((link) => link.rel === 'item');
  const mvt = items.find((link) => /mapbox|mvt|pbf/i.test(`${link.type ?? ''} ${link.title ?? ''} ${link.href}`));
  return (mvt ?? items[0])?.href;
}

// Also returns the tileset's own links: many servers only put the tile template in the tileset document.
export async function loadMatrixSet(fetcher: Fetcher, tileset: Tileset): Promise<MatrixSet & { links: Link[] }> {
  let links = tileset.links;
  let inheritedCrs = tileset.crs;
  const self = byRel(links, ['self']);
  if (self) {
    const detail = await fetchJson(fetcher, self.href);
    links = linksOf(detail).map((link) => ({ ...link, href: absolute(link.href, self.href) }));
    inheritedCrs = typeof detail.crs === 'string' ? detail.crs : inheritedCrs;
  }
  const link = byRel(links, ['http://www.opengis.net/def/rel/ogc/1.0/tiling-scheme', 'tiling-scheme', 'tileMatrixSet']);
  if (!link) {
    throw new Error('This tileset does not advertise a tile matrix set link.');
  }
  const raw = await fetchJson(fetcher, link.href);
  // Tile Matrix Set 2.0 allows the CRS as an object carrying its URI.
  const rawCrs = raw.crs && typeof raw.crs === 'object' ? (raw.crs as { uri?: unknown }).uri : raw.crs;
  const matrices = (raw.tileMatrices as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    links,
    id: String(raw.id ?? link.title ?? 'Tile matrix set'),
    title: typeof raw.title === 'string' ? raw.title : link.title,
    crs: String(rawCrs ?? inheritedCrs ?? ''),
    tileMatrices: matrices.map((m) => ({
      id: String(m.id),
      scaleDenominator: Number(m.scaleDenominator),
      cellSize: Number(m.cellSize),
      pointOfOrigin: m.pointOfOrigin as number[],
      tileWidth: Number(m.tileWidth),
      tileHeight: Number(m.tileHeight),
      matrixWidth: Number(m.matrixWidth),
      matrixHeight: Number(m.matrixHeight),
    })),
  };
}
