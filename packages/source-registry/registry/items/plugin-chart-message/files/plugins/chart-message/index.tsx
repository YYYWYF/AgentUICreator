import {
  defineDataMessageUI,
  type DataMessageUIRenderProps,
} from "@agent-ui/react";
import "./style.css";

interface ChartData {
  title: string;
  items: Array<{ label: string; value: number }>;
}

function ChartMessage({ data }: DataMessageUIRenderProps<ChartData>) {
  const maximum = Math.max(1, ...data.items.map((item) => item.value));
  return (
    <figure data-slot="chart-message" className="agent-ui-chart-message" aria-label={data.title}>
      <figcaption>{data.title}</figcaption>
      <ul>
        {data.items.map((item) => (
          <li key={item.label}>
            <span>{item.label}</span>
            <span data-slot="chart-message-track" className="agent-ui-chart-message__bar" aria-hidden="true">
              <span data-slot="chart-message-fill" style={{ width: `${Math.max(0, item.value / maximum) * 100}%` }} />
            </span>
            <span>{item.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export const chartMessageUI = defineDataMessageUI<ChartData>({
  name: "chart",
  render: ChartMessage,
});
