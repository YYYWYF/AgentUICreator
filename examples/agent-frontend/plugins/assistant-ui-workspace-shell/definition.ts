import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AssistantUiWorkspaceShell } from "../../agent-ui/adapters/assistant-ui/workspace";
import manifestJson from "./manifest.json";

export const assistantUiWorkspaceShellPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiWorkspaceShell,
};

export default assistantUiWorkspaceShellPlugin;
