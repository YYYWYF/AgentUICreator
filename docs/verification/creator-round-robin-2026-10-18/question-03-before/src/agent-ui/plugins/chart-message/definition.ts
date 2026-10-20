import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/chart-message";
import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";
import { ChartMessagePlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], dataMessageUIs: [defineDataMessageUI<unknown>({ name: "chart", render: ChartMessagePlugin })], Component: () => null };
export default definition;
