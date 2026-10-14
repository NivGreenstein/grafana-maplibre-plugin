import React from 'react';
import { FieldType, getFieldDisplayName, type StandardEditorProps } from '@grafana/data';
import {
  Button,
  ColorPickerInput,
  Combobox,
  Field,
  Input,
  RadioButtonGroup,
  Slider,
  Stack,
  Switch,
  useTheme2,
  type ComboboxOption,
} from '@grafana/ui';
import { defaultDataLayer } from '../map/dataLayers';
import { newId, type DataLayer, type MapOptions } from '../types';
import { ListCard, moveItem, replaceAt } from './common';

type Props = StandardEditorProps<DataLayer[], unknown, MapOptions>;

const typeOptions = [
  { value: 'markers' as const, label: 'Markers' },
  { value: 'heatmap' as const, label: 'Heatmap' },
];
const locationOptions = [
  { value: 'auto' as const, label: 'Auto' },
  { value: 'coords' as const, label: 'Coords' },
  { value: 'geohash' as const, label: 'Geohash' },
];

const DataLayerCard: React.FC<{
  layer: DataLayer;
  onChange: (layer: DataLayer) => void;
  context: Props['context'];
}> = ({ layer, onChange, context }) => {
  const theme = useTheme2();
  const frames = (context.data ?? []).filter((frame) => !layer.query || frame.refId === layer.query);
  const names = (numeric: boolean): Array<ComboboxOption<string>> =>
    [
      ...new Set(
        frames.flatMap((frame) =>
          frame.fields.filter((f) => !numeric || f.type === FieldType.number).map((f) => getFieldDisplayName(f, frame))
        )
      ),
    ].map((name) => ({ value: name, label: name }));
  const queries = [
    ...new Set((context.data ?? []).map((frame) => frame.refId).filter((id): id is string => Boolean(id))),
  ];
  const update = (patch: Partial<DataLayer>) => onChange({ ...layer, ...patch });
  const markers = (patch: Partial<DataLayer['markers']>) => update({ markers: { ...layer.markers, ...patch } });
  const heatmap = (patch: Partial<DataLayer['heatmap']>) => update({ heatmap: { ...layer.heatmap, ...patch } });
  const location = (patch: Partial<DataLayer['location']>) => update({ location: { ...layer.location, ...patch } });
  const fieldPicker = (value: string | undefined, onPick: (name?: string) => void, numeric = false) => (
    <Combobox
      options={names(numeric)}
      value={value ?? null}
      isClearable
      placeholder="Field"
      onChange={(o) => onPick(o?.value)}
    />
  );

  return (
    <Stack direction="column" gap={0}>
      <Field label="Name">
        <Input value={layer.name} onChange={(e) => update({ name: e.currentTarget.value })} />
      </Field>
      <Field label="Type">
        <RadioButtonGroup options={typeOptions} value={layer.type} onChange={(type) => update({ type })} />
      </Field>
      <Field label="Query" description="Leave empty to use every query.">
        <Combobox
          options={queries.map((id) => ({ value: id, label: id }))}
          value={layer.query ?? null}
          isClearable
          placeholder="All queries"
          onChange={(o) => update({ query: o?.value })}
        />
      </Field>
      <Field label="Location">
        <RadioButtonGroup
          options={locationOptions}
          value={layer.location.mode}
          onChange={(mode) => location({ mode })}
        />
      </Field>
      {layer.location.mode === 'coords' && (
        <>
          <Field label="Latitude field">
            {fieldPicker(layer.location.latitude, (latitude) => location({ latitude }), true)}
          </Field>
          <Field label="Longitude field">
            {fieldPicker(layer.location.longitude, (longitude) => location({ longitude }), true)}
          </Field>
        </>
      )}
      {layer.location.mode === 'geohash' && (
        <Field label="Geohash field">{fieldPicker(layer.location.geohash, (geohash) => location({ geohash }))}</Field>
      )}
      {layer.type === 'markers' ? (
        <>
          <Field label="Color">
            <ColorPickerInput
              value={theme.visualization.getColorByName(layer.markers.color)}
              onChange={(color) => markers({ color })}
            />
          </Field>
          <Field label="Color field" description="Uses the field's color scheme and thresholds (Standard options).">
            {fieldPicker(layer.markers.colorField, (colorField) => markers({ colorField }))}
          </Field>
          <Field label="Size field">
            {fieldPicker(layer.markers.sizeField, (sizeField) => markers({ sizeField }), true)}
          </Field>
          {layer.markers.sizeField ? (
            <Stack gap={1}>
              <Field label="Min size">
                <Input
                  type="number"
                  value={layer.markers.minSize}
                  onChange={(e) => markers({ minSize: Number(e.currentTarget.value) })}
                />
              </Field>
              <Field label="Max size">
                <Input
                  type="number"
                  value={layer.markers.maxSize}
                  onChange={(e) => markers({ maxSize: Number(e.currentTarget.value) })}
                />
              </Field>
            </Stack>
          ) : (
            <Field label="Size">
              <Slider min={1} max={40} value={layer.markers.size} onChange={(size) => markers({ size })} />
            </Field>
          )}
          <Field label="Opacity">
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={layer.markers.opacity}
              onChange={(opacity) => markers({ opacity })}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Weight field">
            {fieldPicker(layer.heatmap.weightField, (weightField) => heatmap({ weightField }), true)}
          </Field>
          <Field label="Radius">
            <Slider min={1} max={80} value={layer.heatmap.radius} onChange={(radius) => heatmap({ radius })} />
          </Field>
          <Field label="Intensity">
            <Slider
              min={0.1}
              max={5}
              step={0.1}
              value={layer.heatmap.intensity}
              onChange={(intensity) => heatmap({ intensity })}
            />
          </Field>
          <Field label="Opacity">
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={layer.heatmap.opacity}
              onChange={(opacity) => heatmap({ opacity })}
            />
          </Field>
        </>
      )}
      <Field label="Visible">
        <Switch value={layer.visible !== false} onChange={(e) => update({ visible: e.currentTarget.checked })} />
      </Field>
    </Stack>
  );
};

// Query results drawn above the tile sources; later entries are drawn on top.
export const DataLayersEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const layers = value ?? [];
  return (
    <Stack direction="column" gap={1}>
      {layers.map((layer, index) => (
        <ListCard
          key={layer.id}
          title={layer.name || layer.type}
          index={index}
          count={layers.length}
          onMove={(from, to) => onChange(moveItem(layers, from, to))}
          onRemove={() => onChange(layers.filter((_, i) => i !== index))}
        >
          <DataLayerCard
            layer={layer}
            context={context}
            onChange={(next) => onChange(replaceAt(layers, index, next))}
          />
        </ListCard>
      ))}
      <Button
        icon="plus"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...layers, defaultDataLayer(newId())])}
      >
        Add data layer
      </Button>
    </Stack>
  );
};
