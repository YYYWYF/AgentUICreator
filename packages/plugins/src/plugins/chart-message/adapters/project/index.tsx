import { CanonicalChartMessage, defineDataMessageUI } from '@za38.03/agent-ui-plugins';
import './style.css';
export const chartMessageUI = defineDataMessageUI<unknown>({ name: 'chart', render: CanonicalChartMessage });
