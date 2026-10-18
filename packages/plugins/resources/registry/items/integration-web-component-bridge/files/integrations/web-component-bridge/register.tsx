import { createAgentUIElement } from "@za38.03/agent-ui-web-component/host";
import { AgentUICompatibilityRoot } from "../../application/AgentUICompatibilityRoot";
import styles from "./styles.css?inline";
import { agentUILocaleConfig } from "../../agent-ui/i18n/locale-config";
import { agentUIThemeConfig } from "../../agent-ui/theme/theme-config";

// Rebuild after editing AppUIModel or canonical React Plugins.
const Element = createAgentUIElement({ Root: AgentUICompatibilityRoot, styles,
  defaults: { locale: agentUILocaleConfig.defaultLocale, theme: agentUIThemeConfig.theme },
  pluginStyles: "__AGENT_UI_BUNDLED_PLUGIN_CSS__" });
if (!customElements.get("agent-ui")) customElements.define("agent-ui", Element);
