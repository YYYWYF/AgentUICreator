import "./style.css";
import { CanonicalChartMessage, type ChartMessageProps } from "@za38.03/agent-ui-plugins";
export function ChartMessagePlugin(props: ChartMessageProps) {
  return <CanonicalChartMessage {...props} />;
}
