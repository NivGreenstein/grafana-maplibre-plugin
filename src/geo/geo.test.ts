import { lonLatBounds, quadGrid } from './crs';
import { capabilitiesEntries, loadCswCatalog, parseCapabilities, planWmts } from './wmts';
import { mvtLayerNames } from './vectorProtocol';
import { capabilitiesXml, cswPage } from './__fixtures__/capabilities';
import type { Fetcher } from './types';

const crs84 = (level: number, id = String(level)) => ({
  id,
  matrixWidth: 2 ** (level + 1),
  matrixHeight: 2 ** level,
  tileWidth: 256,
  tileHeight: 256,
  origin: [-180, 90],
  scaleDenominator: 279541132.0143589 / 2 ** level,
});

describe('quadGrid', () => {
  it('recognises WorldCRS84Quad with a matrix identifier prefix', () => {
    expect(quadGrid('EPSG:4326', [crs84(0, 'EPSG:4326:0'), crs84(1, 'EPSG:4326:1')])).toEqual({
      quad: 'WorldCRS84Quad',
      prefix: 'EPSG:4326:',
      minLevel: 0,
      maxLevel: 1,
      tileSize: 256,
    });
  });

  it('recognises WebMercatorQuad', () => {
    const edge = 20037508.342789244;
    const matrix = {
      id: '0',
      matrixWidth: 1,
      matrixHeight: 1,
      tileWidth: 256,
      tileHeight: 256,
      origin: [-edge, edge],
      scaleDenominator: 559082264.0287178,
    };
    expect(quadGrid('EPSG:3857', [matrix])).toMatchObject({ quad: 'WebMercatorQuad', minLevel: 0 });
  });

  it('refuses matrices spanning more than the world', () => {
    expect(typeof quadGrid('EPSG:4326', [{ ...crs84(0), tileWidth: 512, tileHeight: 512 }])).toBe('string');
  });

  it('refuses other CRSs', () => {
    expect(quadGrid('EPSG:2039', [crs84(0)])).toMatch(/neither/);
  });
});

describe('lonLatBounds', () => {
  it('reads latitude-first EPSG:4326 boxes', () => {
    expect(lonLatBounds([29, 34], [33, 36], 'EPSG:4326')).toEqual([34, 29, 36, 33]);
  });

  it('keeps longitude-first boxes whose first ordinate exceeds 90', () => {
    expect(lonLatBounds([-170, 10], [120, 20], 'EPSG:4326')).toEqual([-170, 10, 120, 20]);
  });
});

describe('WMTS', () => {
  const capabilities = parseCapabilities(capabilitiesXml);

  it('lists layers', () => {
    expect(capabilitiesEntries(capabilities, 'https://x/caps').map((entry) => entry.id)).toEqual(['ortho', 'gibs']);
  });

  it('draws a WorldCRS84Quad layer natively on a 4326 map', () => {
    const plan = planWmts(capabilities, 'ortho', 'WorldCRS84Quad');
    expect(plan.reprojected).toBe(false);
    expect(plan.tiles.kind).toBe('quad');
    if (plan.tiles.kind === 'quad') {
      expect(plan.tiles.tileUrl('{z}', '{x}', '{y}')).toBe(
        'https://tiles.example.com/ortho/default/WorldCRS84Quad/{z}/{x}/{y}.png'
      );
      expect(plan.tiles.bounds).toEqual([34, 29, 36, 33]);
    }
  });

  it('reprojects a WorldCRS84Quad layer on a 3857 map', () => {
    expect(planWmts(capabilities, 'ortho', 'WebMercatorQuad').reprojected).toBe(true);
  });

  it('resamples a GIBS-style plate carrée layer', () => {
    const plan = planWmts(capabilities, 'gibs', 'WorldCRS84Quad');
    expect(plan.tiles.kind).toBe('plate-carree');
  });
});

describe('loadCswCatalog', () => {
  it('pages through the catalog and reads WMTS links', async () => {
    const bodies: string[] = [];
    const fetcher: Fetcher = async (_url, init) => {
      bodies.push(String(init?.body));
      const start = Number(/startPosition="(\d+)"/.exec(String(init?.body))?.[1]);
      const text = cswPage(start, start === 1 ? 3 : 0);
      return { ok: true, text: async () => text } as Response;
    };
    const entries = await loadCswCatalog(fetcher, 'https://csw.example.com/csw');
    expect(bodies).toHaveLength(2);
    expect(entries).toEqual([
      {
        id: 'a',
        title: 'Area A',
        capabilitiesUrl: 'https://wmts.example.com/capabilities',
        wmtsLayerId: 'a-layer',
        matrixSets: [],
      },
      {
        id: 'b',
        title: 'Area B',
        capabilitiesUrl: 'https://wmts.example.com/b',
        wmtsLayerId: 'b-layer',
        matrixSets: [],
      },
      {
        id: 'c',
        title: 'c',
        capabilitiesUrl: 'https://wmts.example.com/capabilities',
        wmtsLayerId: 'c-layer',
        matrixSets: [],
      },
    ]);
  });
});

describe('mvtLayerNames', () => {
  it('reads layer names from a tile', () => {
    // Tile { layers: [{ name: "roads", version: 2 }] }
    const layer = [0x0a, 0x05, ...new TextEncoder().encode('roads'), 0x78, 0x02];
    expect(mvtLayerNames(new Uint8Array([0x1a, layer.length, ...layer]))).toEqual(['roads']);
  });
});
