import React from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { IconButton, Stack, useStyles2 } from '@grafana/ui';

const getStyles = (theme: GrafanaTheme2) => ({
  card: css({
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(1),
    marginBottom: theme.spacing(1),
    background: theme.colors.background.secondary,
  }),
  title: css({ flex: 1, fontWeight: theme.typography.fontWeightMedium, overflow: 'hidden', textOverflow: 'ellipsis' }),
});

type CardProps = {
  title: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  children: React.ReactNode;
};

// One entry of an ordered option list, with move and delete buttons.
export const ListCard: React.FC<CardProps> = ({ title, index, count, onMove, onRemove, children }) => {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.card}>
      <Stack alignItems="center" gap={0.5}>
        <span className={styles.title}>{title}</span>
        <IconButton name="arrow-up" tooltip="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)} />
        <IconButton
          name="arrow-down"
          tooltip="Move down"
          disabled={index === count - 1}
          onClick={() => onMove(index, index + 1)}
        />
        <IconButton name="trash-alt" tooltip="Remove" onClick={onRemove} />
      </Stack>
      {children}
    </div>
  );
};

export function moveItem<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export const replaceAt = <T,>(list: T[], index: number, item: T) =>
  list.map((existing, i) => (i === index ? item : existing));
