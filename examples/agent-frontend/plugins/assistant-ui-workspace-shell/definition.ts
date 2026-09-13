import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";
import { AssistantUiWorkspaceShell } from "../../agent-ui/adapters/assistant-ui/workspace";
import manifestJson from "./manifest.json";

export const assistantUiWorkspaceShellPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_THEME_SERVICE],
  Component: AssistantUiWorkspaceShell,
};

export default assistantUiWorkspaceShellPlugin;
