import type { ComponentProps, ReactNode } from "react";
import type { DataMessageUIRenderProps } from "../../../../public.js";
import { projectChartMessage, type ChartMessageData, type ChartMessageItem } from "./projection.js";
export type { ChartMessageData, ChartMessageItem } from "./projection.js";
export interface ChartMessageProps extends DataMessageUIRenderProps<unknown> {
  rootProps?: Omit<ComponentProps<"figure">, "children">;
  captionProps?: Omit<ComponentProps<"figcaption">, "children">;
  listProps?: Omit<ComponentProps<"ul">, "children">;
  itemProps?: Omit<ComponentProps<"li">, "children">;
  labelProps?: Omit<ComponentProps<"span">, "children">;
  trackProps?: Omit<ComponentProps<"span">, "children">;
  barProps?: Omit<ComponentProps<"span">, "children">;
  valueProps?: Omit<ComponentProps<"span">, "children">;
  formatValue?: (value: number, item: ChartMessageItem) => ReactNode;
  renderItem?: (item: ChartMessageItem, index: number, data: ChartMessageData) => ReactNode;
  renderChart?: (data: ChartMessageData) => ReactNode;
}
export function CanonicalChartMessage({ data, rootProps, captionProps, listProps, itemProps, labelProps, trackProps, barProps, valueProps, formatValue, renderItem, renderChart }: ChartMessageProps) {
  const chart = projectChartMessage(data);
  if (chart === null) return null;
  if (renderChart) return <>{renderChart(chart)}</>;
  const maximum = chart.items.reduce((maximum, item) => Math.max(maximum, item.value), 1);
  return <figure data-slot="chart-message" className="agent-ui-chart-message" aria-label={chart.title} {...rootProps}>
    <figcaption {...captionProps}>{chart.title}</figcaption>
    <ul {...listProps}>{chart.items.map((item, index) => <li key={index} {...itemProps}>{renderItem ? renderItem(item, index, chart) : <>
      <span {...labelProps}>{item.label}</span>
      <span data-slot="chart-message-track" className="agent-ui-chart-message__bar" aria-hidden="true" {...trackProps}>
        <span data-slot="chart-message-fill" {...barProps} style={{ width: `${Math.max(0, item.value / maximum) * 100}%`, ...barProps?.style }} />
      </span>
      <span {...valueProps}>{formatValue ? formatValue(item.value, item) : item.value}</span>
    </>}</li>)}</ul>
  </figure>;
}
