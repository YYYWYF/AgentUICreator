import { CanonicalChartMessage, type ChartMessageProps } from '@za38.03/agent-ui-plugins';
import './style.css';
export function ChartMessagePlugin(props: ChartMessageProps) {
  return <CanonicalChartMessage {...props} />;
}
