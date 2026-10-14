import React, { useState } from 'react';
import type { StandardEditorProps } from '@grafana/data';
import { Button, Checkbox, IconButton, Input, Stack } from '@grafana/ui';
import { newId, type HeaderRow, type MapOptions } from '../types';

// Postman-style request headers; values may use dashboard variables such as ${api_key}.
export const HeadersEditor: React.FC<StandardEditorProps<HeaderRow[], unknown, MapOptions>> = ({ value, onChange }) => {
  const rows = value ?? [];
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const update = (index: number, patch: Partial<HeaderRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <Stack direction="column" gap={1}>
      {rows.map((row, index) => (
        <Stack key={row.id} direction="column" gap={0.5}>
          <Stack alignItems="center" gap={0.5}>
            <Checkbox value={row.enabled} onChange={(e) => update(index, { enabled: e.currentTarget.checked })} />
            <Input
              placeholder="Header, e.g. x-api-key"
              value={row.name}
              onChange={(e) => update(index, { name: e.currentTarget.value })}
            />
            <IconButton
              name="trash-alt"
              tooltip="Remove"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            />
          </Stack>
          <Input
            placeholder="Value or ${variable}"
            type={shown[row.id] ? 'text' : 'password'}
            value={row.value}
            onChange={(e) => update(index, { value: e.currentTarget.value })}
            suffix={
              <IconButton
                name={shown[row.id] ? 'eye-slash' : 'eye'}
                tooltip={shown[row.id] ? 'Hide' : 'Show'}
                onClick={() => setShown({ ...shown, [row.id]: !shown[row.id] })}
              />
            }
          />
          <Input
            placeholder="Only for host (optional)"
            value={row.host}
            onChange={(e) => update(index, { host: e.currentTarget.value })}
          />
        </Stack>
      ))}
      <Button
        icon="plus"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...rows, { id: newId(), enabled: true, name: '', value: '', host: '' }])}
      >
        Add header
      </Button>
    </Stack>
  );
};
