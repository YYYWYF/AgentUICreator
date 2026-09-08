import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";
import { AntdXThemeSwitchPlugin } from "./index";
import manifestJson from "./manifest.json";

export const antdXThemeSwitchPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_THEME_SERVICE],
  Component: AntdXThemeSwitchPlugin,
};

export default antdXThemeSwitchPlugin;
