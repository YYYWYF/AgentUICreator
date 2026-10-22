import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { LocaleSwitchPlugin } from "./index";
import manifestJson from "./manifest.json";

export const localeSwitchPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_LOCALE_SERVICE],
  Component: LocaleSwitchPlugin,
};

export default localeSwitchPlugin;
