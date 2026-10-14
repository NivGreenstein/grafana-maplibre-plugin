import React, { useState } from 'react';
import type { StandardEditorProps } from '@grafana/data';
import {
  Alert,
  Button,
  Combobox,
  Field,
  Input,
  MultiCombobox,
  RadioButtonGroup,
  Slider,
  Stack,
  Switch,
  type ComboboxOption,
} from '@grafana/ui';
import { discover } from '../geo/ogc';
import { capabilitiesEntries, loadCapabilities, loadCswCatalog } from '../geo/wmts';
import { interpolateHeaders, makeFetcher } from '../map/headers';
import { newId, type MapOptions, type SourceKind, type SourceLayer } from '../types';
import { ListCard, moveItem, replaceAt } from './common';

const kinds: Array<ComboboxOption<SourceKind>> = [
  { value: 'xyz-raster', label: 'Raster tile template', description: 'XYZ / WMTS REST template with {z}/{x}/{y}' },
  { value: 'wmts', label: 'WMTS capabilities', description: 'A WMTS GetCapabilities URL' },
  { value: 'csw', label: 'MapColonies CSW', description: 'A MapColonies raster catalog' },
  { value: 'mvt', label: 'Vector tile template', description: 'MVT template with {z}/{x}/{y}' },
  { value: 'ogc-api', label: 'OGC API Tiles', description: 'An OGC API landing page' },
];
const kindLabel = (kind: SourceKind) => kinds.find((option) => option.value === kind)?.label ?? kind;
const isCatalog = (kind: SourceKind) => kind === 'wmts' || kind === 'csw' || kind === 'ogc-api';
const isTemplate = (kind: SourceKind) => kind === 'xyz-raster' || kind === 'mvt';
const isVector = (kind: SourceKind) => kind === 'mvt' || kind === 'ogc-api';

const gridOptions = [
  { value: 'WorldCRS84Quad' as const, label: 'EPSG:4326' },
  { value: 'WebMercatorQuad' as const, label: 'EPSG:3857' },
];

type Props = StandardEditorProps<SourceLayer[], unknown, MapOptions>;

const SourceCard: React.FC<{
  layer: SourceLayer;
  onChange: (layer: SourceLayer) => void;
  context: Props['context'];
}> = ({ layer, onChange, context }) => {
  const [options, setOptions] = useState<Array<ComboboxOption<string>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const update = (patch: Partial<SourceLayer>) => onChange({ ...layer, ...patch });
  const replace = (value: string) => context.replaceVariables?.(value) ?? value;

  // Reads the catalog with the panel's headers, so the user can pick its layers.
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const fetcher = makeFetcher(interpolateHeaders(context.options?.headers ?? [], replace));
      const url = replace(layer.url).trim();
      if (layer.kind === 'wmts') {
        const entries = capabilitiesEntries(await loadCapabilities(fetcher, url), url);
        setOptions(
          entries.map((entry) => ({ value: entry.id, label: entry.title, description: entry.matrixSets.join(', ') }))
        );
      } else if (layer.kind === 'csw') {
        const entries = await loadCswCatalog(fetcher, url);
        setOptions(entries.map((entry) => ({ value: entry.id, label: entry.title, description: entry.id })));
      } else {
        const tilesets = await discover(fetcher, url);
        setOptions(
          tilesets.map((set) => ({ value: set.id, label: set.title, description: set.tileMatrixSetId ?? set.crs }))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const selected = layer.selected ?? [];
  // Keep saved picks visible before the catalog is loaded.
  const pickOptions = [
    ...options,
    ...selected.filter((id) => !options.some((o) => o.value === id)).map((id) => ({ value: id, label: id })),
  ];

  return (
    <Stack direction="column" gap={0}>
      <Field label="Name">
        <Input
          value={layer.name}
          placeholder={kindLabel(layer.kind)}
          onChange={(e) => update({ name: e.currentTarget.value })}
        />
      </Field>
      <Field label="Type">
        <Combobox
          options={kinds}
          value={layer.kind}
          onChange={(option) => option && update({ kind: option.value, selected: [] })}
        />
      </Field>
      <Field
        label="URL"
        description={isTemplate(layer.kind) ? 'Use {z}, {x} and {y}; dashboard variables work too.' : undefined}
      >
        <Input value={layer.url} onChange={(e) => update({ url: e.currentTarget.value })} />
      </Field>
      {isTemplate(layer.kind) && (
        <>
          <Field label="Tile grid" description="The tile matrix set the template addresses.">
            <RadioButtonGroup
              options={gridOptions}
              value={layer.grid ?? 'WorldCRS84Quad'}
              onChange={(grid) => update({ grid })}
            />
          </Field>
          <Stack gap={1}>
            <Field label="Min level">
              <Input
                type="number"
                value={layer.minzoom ?? 0}
                onChange={(e) => update({ minzoom: Number(e.currentTarget.value) })}
              />
            </Field>
            <Field label="Max level">
              <Input
                type="number"
                value={layer.maxzoom ?? (layer.kind === 'mvt' ? 14 : 22)}
                onChange={(e) => update({ maxzoom: Number(e.currentTarget.value) })}
              />
            </Field>
            {layer.kind === 'xyz-raster' && (
              <Field label="Tile size">
                <Input
                  type="number"
                  value={layer.tileSize ?? 256}
                  onChange={(e) => update({ tileSize: Number(e.currentTarget.value) })}
                />
              </Field>
            )}
          </Stack>
        </>
      )}
      {isCatalog(layer.kind) && (
        <Field
          label="Layers"
          description={`${options.length ? `${options.length} available` : 'Load the catalog to list its layers'}.`}
        >
          <Stack direction="column" gap={0.5}>
            <Button
              size="sm"
              variant="secondary"
              icon={loading ? 'spinner' : 'sync'}
              disabled={!layer.url || loading}
              onClick={load}
            >
              Load
            </Button>
            <MultiCombobox
              options={pickOptions}
              value={selected}
              placeholder="Search layers"
              onChange={(picked) => update({ selected: picked.map((option) => option.value) })}
            />
          </Stack>
        </Field>
      )}
      {error && (
        <Alert severity="error" title="Could not load the catalog">
          {error}
        </Alert>
      )}
      {isVector(layer.kind) && (
        <Field
          label="Style URL"
          description="Optional MapLibre style; otherwise features are colored by geometry type."
        >
          <Input value={layer.styleUrl ?? ''} onChange={(e) => update({ styleUrl: e.currentTarget.value })} />
        </Field>
      )}
      <Field label="Opacity">
        <Slider min={0} max={1} step={0.05} value={layer.opacity ?? 1} onChange={(opacity) => update({ opacity })} />
      </Field>
      <Field label="Visible">
        <Switch value={layer.visible !== false} onChange={(e) => update({ visible: e.currentTarget.checked })} />
      </Field>
    </Stack>
  );
};

// The map's tile sources; the first one is drawn at the bottom.
export const SourcesEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const layers = value ?? [];
  const [adding, setAdding] = useState<SourceKind | null>(null);
  return (
    <Stack direction="column" gap={1}>
      {layers.map((layer, index) => (
        <ListCard
          key={layer.id}
          title={layer.name || kindLabel(layer.kind)}
          index={index}
          count={layers.length}
          onMove={(from, to) => onChange(moveItem(layers, from, to))}
          onRemove={() => onChange(layers.filter((_, i) => i !== index))}
        >
          <SourceCard layer={layer} context={context} onChange={(next) => onChange(replaceAt(layers, index, next))} />
        </ListCard>
      ))}
      <Combobox
        options={kinds}
        value={adding}
        placeholder="Add a source"
        onChange={(option) => {
          if (option) {
            onChange([...layers, { id: newId(), name: '', kind: option.value, url: '', visible: true, opacity: 1 }]);
            setAdding(null);
          }
        }}
      />
    </Stack>
  );
};
