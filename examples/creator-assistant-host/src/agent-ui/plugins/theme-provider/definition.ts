import implementation from "@za38.03/agent-ui-plugins/theme-provider";
import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import { parseUIPluginManifest } from "@za38.03/agent-ui-plugins";
import { ThemeProviderPlugin } from "./index";
import manifestJson from "./manifest.json";
import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";
import { createAgentUIThemeService } from "@za38.03/agent-ui-plugins/theme-provider";

export const themeProviderPlugin: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [AGENT_UI_THEME_SERVICE],
  setup: implementation.bindSetup(({ services }: Parameters<NonNullable<UIPluginDefinition["setup"]>>[0]) => {
    const theme = createAgentUIThemeService();

    services.provide(AGENT_UI_THEME_SERVICE, theme);
  }),
  Component: ThemeProviderPlugin,
};

export default themeProviderPlugin;
