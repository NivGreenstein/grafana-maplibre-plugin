import { FieldColorModeId, PanelPlugin } from '@grafana/data';
import { MapPanel } from './components/MapPanel';
import { DataLayersEditor } from './editors/DataLayersEditor';
import { HeadersEditor } from './editors/HeadersEditor';
import { SourcesEditor } from './editors/SourcesEditor';
import type { MapOptions } from './types';

export const plugin = new PanelPlugin<MapOptions>(MapPanel)
  .useFieldConfig({
    standardOptions: { color: { defaultValue: { mode: FieldColorModeId.Thresholds } } },
  })
  .setPanelOptions((builder) => {
    const view = ['Map view'];
    return builder
      .addRadio({
        path: 'projection',
        name: 'Projection',
        description: 'All maps of this plugin on a dashboard share one projection.',
        category: view,
        defaultValue: 'WorldCRS84Quad',
        settings: {
          options: [
            { value: 'WorldCRS84Quad', label: 'EPSG:4326', description: 'WorldCRS84Quad, no reprojection' },
            {
              value: 'WebMercatorQuad',
              label: 'EPSG:3857',
              description: 'WebMercatorQuad; 4326 rasters are reprojected',
            },
          ],
        },
      })
      .addRadio({
        path: 'view.mode',
        name: 'Initial view',
        category: view,
        defaultValue: 'fit',
        settings: {
          options: [
            { value: 'fit', label: 'Fit to data' },
            { value: 'coords', label: 'Coordinates' },
          ],
        },
      })
      .addNumberInput({
        path: 'view.latitude',
        name: 'Latitude',
        category: view,
        defaultValue: 0,
        showIf: (o) => o.view?.mode === 'coords',
      })
      .addNumberInput({
        path: 'view.longitude',
        name: 'Longitude',
        category: view,
        defaultValue: 0,
        showIf: (o) => o.view?.mode === 'coords',
      })
      .addNumberInput({
        path: 'view.zoom',
        name: 'Zoom',
        category: view,
        defaultValue: 1,
        showIf: (o) => o.view?.mode === 'coords',
      })
      .addBooleanSwitch({ path: 'showZoom', name: 'Zoom buttons', category: view, defaultValue: true })
      .addBooleanSwitch({ path: 'showScale', name: 'Scale bar', category: view, defaultValue: false })
      .addColorPicker({
        path: 'background',
        name: 'Background',
        description: 'Shown where no tiles are drawn.',
        category: view,
        defaultValue: 'white',
      })
      .addBooleanSwitch({
        path: 'tileDebug',
        name: 'Tile grid',
        description: 'Label tiles with level/col/row.',
        category: view,
        defaultValue: false,
      })
      .addCustomEditor({
        id: 'sources',
        path: 'sources',
        name: 'Sources',
        description: 'Tile layers, drawn in order: the first is at the bottom.',
        category: ['Tile sources'],
        editor: SourcesEditor,
        defaultValue: [],
      })
      .addCustomEditor({
        id: 'dataLayers',
        path: 'dataLayers',
        name: 'Data layers',
        description: 'Query results drawn above the tile sources.',
        category: ['Data layers'],
        editor: DataLayersEditor,
        defaultValue: [],
      })
      .addRadio({
        path: 'tooltip',
        name: 'Tooltip',
        category: ['Data layers'],
        defaultValue: 'hover',
        settings: {
          options: [
            { value: 'none', label: 'None' },
            { value: 'hover', label: 'Hover' },
            { value: 'click', label: 'Click' },
          ],
        },
      })
      .addCustomEditor({
        id: 'headers',
        path: 'headers',
        name: 'Request headers',
        description:
          'Sent with every tile, capabilities and catalog request. Stored in the dashboard JSON; use variables for secrets.',
        category: ['Request headers'],
        editor: HeadersEditor,
        defaultValue: [],
      });
  });
