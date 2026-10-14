import React from 'react';
import { css } from '@emotion/css';
import { formattedValueToString, getFieldDisplayName, type DataFrame, type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

export type Hover = { x: number; y: number; hits: Array<{ frame: number; row: number }> };

const getStyles = (theme: GrafanaTheme2) => ({
  tooltip: css({
    position: 'absolute',
    zIndex: 3,
    maxWidth: 360,
    maxHeight: 280,
    overflow: 'auto',
    padding: theme.spacing(1),
    background: theme.colors.background.primary,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    boxShadow: theme.shadows.z3,
    fontSize: theme.typography.bodySmall.fontSize,
    pointerEvents: 'none',
  }),
  row: css({ display: 'flex', gap: theme.spacing(2), justifyContent: 'space-between' }),
  name: css({ color: theme.colors.text.secondary }),
  divider: css({ borderTop: `1px solid ${theme.colors.border.weak}`, margin: theme.spacing(0.5, 0) }),
});

// Shows the data rows under the cursor, Geomap-style.
export const Tooltip: React.FC<{ hover: Hover; frames: DataFrame[] }> = ({ hover, frames }) => {
  const styles = useStyles2(getStyles);
  const hits = hover.hits.slice(0, 5);
  return (
    <div className={styles.tooltip} style={{ left: hover.x + 12, top: hover.y + 12 }}>
      {hits.map(({ frame, row }, index) => {
        const dataFrame = frames[frame];
        if (!dataFrame) {
          return null;
        }
        return (
          <div key={`${frame}:${row}`}>
            {index > 0 && <div className={styles.divider} />}
            {dataFrame.fields.map((field) => {
              const value = field.values[row];
              const text = field.display ? formattedValueToString(field.display(value)) : String(value ?? '');
              return (
                <div className={styles.row} key={field.name}>
                  <span className={styles.name}>{getFieldDisplayName(field, dataFrame, frames)}</span>
                  <span>{text}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      {hover.hits.length > hits.length && <div className={styles.name}>+{hover.hits.length - hits.length} more</div>}
    </div>
  );
};
