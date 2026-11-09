import { createAgentUIElement } from "./host";
import { AgentUIBridgeRoot } from "./AgentUIBridgeRoot";
import "./styles.css";
export const AgentUIElement = createAgentUIElement({ Root: AgentUIBridgeRoot, styles: "", pluginStyles: "__AGENT_UI_BUNDLED_PLUGIN_CSS__" });
export type AgentUIElement = InstanceType<typeof AgentUIElement>;
