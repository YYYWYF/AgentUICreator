import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { ThemeProviderPlugin } from "./index";
import manifestJson from "./manifest.json";
import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";
import {
  createAgentUIThemeService,
  readAgentUIThemeMode,
} from "./theme-service";

export const themeProviderPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: [AGENT_UI_THEME_SERVICE],
  setup: ({ instance, actions, services }) => {
    const theme = createAgentUIThemeService(
      readAgentUIThemeMode(instance.props?.mode),
      (mode) => actions.updateInstanceProps({ mode }),
    );

    services.provide(AGENT_UI_THEME_SERVICE, theme);
  },
  Component: ThemeProviderPlugin,
};

export default themeProviderPlugin;
