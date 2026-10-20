import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/agent-plan-message";
import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";
import { AgentPlanMessagePlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], dataMessageUIs: [defineDataMessageUI<unknown>({ name: "agui-activity/agent-plan", render: AgentPlanMessagePlugin })], Component: () => null };
export default definition;
