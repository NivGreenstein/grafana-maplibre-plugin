import { discover } from './ogc';
import type { Fetcher } from './types';

// The shape maps.gnosis.earth publishes: one entry per tile matrix set, no id, the same title.
const tileset = (tms: string) => ({
  title: 'NaturalEarth:cultural',
  tileMatrixSetURI: `http://www.opengis.net/def/tilematrixset/OGC/1.0/${tms}`,
  dataType: 'vector',
  links: [
    { rel: 'self', href: `/ogcapi/tiles/${tms}?f=json` },
    { rel: 'item', templated: true, href: `/ogcapi/tiles/${tms}/{tileMatrix}/{tileRow}/{tileCol}.mvt` },
  ],
});

const documents: Record<string, unknown> = {
  'https://example.com/ogcapi': { links: [{ rel: 'tilesets-vector', href: '/ogcapi/tiles' }] },
  'https://example.com/ogcapi/tiles': { tilesets: [tileset('WebMercatorQuad'), tileset('WorldCRS84Quad')] },
};

const fetcher: Fetcher = async (url) => {
  const body = JSON.stringify(documents[url.split('?')[0]] ?? {});
  return { ok: true, text: async () => body } as Response;
};

describe('discover', () => {
  it('keeps one entry per tile matrix set apart', async () => {
    const sets = await discover(fetcher, 'https://example.com/ogcapi');
    expect(sets.map((set) => set.tileMatrixSetId)).toEqual(['WebMercatorQuad', 'WorldCRS84Quad']);
    expect(new Set(sets.map((set) => set.id)).size).toBe(2);
    expect(sets[1].id).toBe('https://example.com/ogcapi/tiles/WorldCRS84Quad?f=json');
  });
});
