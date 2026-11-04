import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import type { DataMessageUIRenderProps } from '../../../../public.js';
import { projectChartMessage, type ChartMessageData, type ChartMessageItem } from './projection.js';
export type { ChartMessageData, ChartMessageItem } from './projection.js';
export interface ChartMessageProps
  extends DataMessageUIRenderProps<unknown>,
    Omit<ComponentProps<'figure'>, 'children' | 'title'> {
  title?: ReactNode;
  classNames?: Partial<Record<'caption' | 'list' | 'item' | 'label' | 'track' | 'bar' | 'value', string>>;
  styles?: Partial<Record<'caption' | 'list' | 'item' | 'label' | 'track' | 'bar' | 'value', CSSProperties>>;
  formatValue?: (value: number, item: ChartMessageItem) => ReactNode;
  renderItem?: (item: ChartMessageItem, index: number, data: ChartMessageData) => ReactNode;
  renderChart?: (data: ChartMessageData) => ReactNode;
}
export function CanonicalChartMessage({
  data,
  title,
  classNames,
  styles,
  formatValue,
  renderItem,
  renderChart,
  ...rootProps
}: ChartMessageProps) {
  const chart = projectChartMessage(data);
  if (chart === null) {
    return null;
  }
  if (renderChart) {
    return <>{renderChart(chart)}</>;
  }
  const maximum = chart.items.reduce((maximum, item) => Math.max(maximum, item.value), 1);
  return (
    <figure
      data-slot='chart-message'
      {...rootProps}
      className={['agent-ui-chart-message', rootProps.className].filter(Boolean).join(' ')}
      aria-label={rootProps['aria-label'] ?? chart.title}
    >
      <figcaption className={classNames?.caption} style={styles?.caption}>
        {title ?? chart.title}
      </figcaption>
      <ul className={classNames?.list} style={styles?.list}>
        {chart.items.map((item, index) => (
          <li key={index} className={classNames?.item} style={styles?.item}>
            {renderItem ? (
              renderItem(item, index, chart)
            ) : (
              <>
                <span className={classNames?.label} style={styles?.label}>
                  {item.label}
                </span>
                <span
                  data-slot='chart-message-track'
                  className={['agent-ui-chart-message__bar', classNames?.track].filter(Boolean).join(' ')}
                  aria-hidden='true'
                  style={styles?.track}
                >
                  <span
                    data-slot='chart-message-fill'
                    className={classNames?.bar}
                    style={{ width: `${Math.max(0, item.value / maximum) * 100}%`, ...styles?.bar }}
                  />
                </span>
                <span className={classNames?.value} style={styles?.value}>
                  {formatValue ? formatValue(item.value, item) : item.value}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </figure>
  );
}
