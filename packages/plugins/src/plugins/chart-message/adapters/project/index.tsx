import "./style.css";
import { CanonicalChartMessage, defineDataMessageUI } from "@za38.03/agent-ui-plugins";
export const chartMessageUI = defineDataMessageUI<unknown>({ name: "chart", render: CanonicalChartMessage });
