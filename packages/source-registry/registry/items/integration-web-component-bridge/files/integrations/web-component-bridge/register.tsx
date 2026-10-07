import { createAgentUIElement } from "@agentui/web-component/host";
import { AgentUICompatibilityRoot } from "../../application/AgentUICompatibilityRoot";
import styles from "./styles.css?inline";

// Rebuild after editing AppUIModel or canonical React Plugins.
const Element = createAgentUIElement({ Root: AgentUICompatibilityRoot, styles,
  pluginStyles: "__AGENT_UI_BUNDLED_PLUGIN_CSS__" });
if (!customElements.get("agent-ui")) customElements.define("agent-ui", Element);
