import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";
import { ThemeSwitchPlugin } from "./index";
import manifestJson from "./manifest.json";

export const themeSwitchPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_THEME_SERVICE],
  Component: ThemeSwitchPlugin,
};

export default themeSwitchPlugin;
