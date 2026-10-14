// A WMTS capabilities document with one WorldCRS84Quad layer and one NASA GIBS-style 512 px EPSG:4326 layer.
const crs84Matrices = [0, 1, 2]
  .map(
    (level) => `
      <TileMatrix>
        <ows:Identifier>${level}</ows:Identifier>
        <ScaleDenominator>${279541132.0143589 / 2 ** level}</ScaleDenominator>
        <TopLeftCorner>-180 90</TopLeftCorner>
        <TileWidth>256</TileWidth><TileHeight>256</TileHeight>
        <MatrixWidth>${2 ** (level + 1)}</MatrixWidth><MatrixHeight>${2 ** level}</MatrixHeight>
      </TileMatrix>`
  )
  .join('');

export const capabilitiesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.0.0">
  <Contents>
    <Layer>
      <ows:Title>Orthophoto</ows:Title>
      <ows:WGS84BoundingBox><ows:LowerCorner>34 29</ows:LowerCorner><ows:UpperCorner>36 33</ows:UpperCorner></ows:WGS84BoundingBox>
      <ows:Identifier>ortho</ows:Identifier>
      <Style isDefault="true"><ows:Identifier>default</ows:Identifier></Style>
      <Format>image/png</Format>
      <TileMatrixSetLink><TileMatrixSet>WorldCRS84Quad</TileMatrixSet></TileMatrixSetLink>
      <ResourceURL format="image/png" resourceType="tile" template="https://tiles.example.com/ortho/{Style}/{TileMatrixSet}/{TileMatrix}/{TileCol}/{TileRow}.png"/>
    </Layer>
    <Layer>
      <ows:Title>Gibs</ows:Title>
      <ows:Identifier>gibs</ows:Identifier>
      <Style isDefault="true"><ows:Identifier>default</ows:Identifier></Style>
      <Format>image/jpeg</Format>
      <TileMatrixSetLink><TileMatrixSet>250m</TileMatrixSet></TileMatrixSetLink>
      <ResourceURL format="image/jpeg" resourceType="tile" template="https://gibs.example.com/gibs/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg"/>
    </Layer>
    <TileMatrixSet>
      <ows:Identifier>WorldCRS84Quad</ows:Identifier>
      <ows:SupportedCRS>urn:ogc:def:crs:OGC:1.3:CRS84</ows:SupportedCRS>${crs84Matrices}
    </TileMatrixSet>
    <TileMatrixSet>
      <ows:Identifier>250m</ows:Identifier>
      <ows:SupportedCRS>urn:ogc:def:crs:EPSG::4326</ows:SupportedCRS>
      <TileMatrix>
        <ows:Identifier>0</ows:Identifier>
        <ScaleDenominator>223632905.6114871</ScaleDenominator>
        <TopLeftCorner>90 -180</TopLeftCorner>
        <TileWidth>512</TileWidth><TileHeight>512</TileHeight>
        <MatrixWidth>2</MatrixWidth><MatrixHeight>1</MatrixHeight>
      </TileMatrix>
    </TileMatrixSet>
  </Contents>
</Capabilities>`;

const record = (id: string, name: string, link: string) => `
  <mc:MCRasterRecord>
    <mc:productId>${id}</mc:productId>
    <mc:productName>${name}</mc:productName>
    <mc:links scheme="WMTS" name="${id}-layer">${link}</mc:links>
  </mc:MCRasterRecord>`;

export const cswPage = (start: number, next: number) => `<?xml version="1.0" encoding="UTF-8"?>
<csw:GetRecordsResponse xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" xmlns:mc="http://schema.mapcolonies.com/raster">
  <csw:SearchResults numberOfRecordsMatched="3" numberOfRecordsReturned="${start === 1 ? 2 : 1}" nextRecord="${next}">
    ${
      start === 1
        ? record('a', 'Area A', 'https://wmts.example.com/capabilities') +
          record('b', 'Area B', "'https://wmts.example.com/b'")
        : record('c', '', 'https://wmts.example.com/capabilities')
    }
  </csw:SearchResults>
</csw:GetRecordsResponse>`;
