import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AntdXThemeProviderPlugin } from "./index";
import manifestJson from "./manifest.json";
import {
  AGENT_UI_THEME_SERVICE,
  createAgentUIThemeService,
  readAgentUIThemeMode,
} from "./theme-service";

export const antdXThemeProviderPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  setup: ({ instance, actions, services }) => {
    const theme = createAgentUIThemeService(
      readAgentUIThemeMode(instance.props?.mode),
      (mode) => actions.updateInstanceProps({ mode }),
    );

    services.provide(AGENT_UI_THEME_SERVICE, theme);
  },
  Component: AntdXThemeProviderPlugin,
};
