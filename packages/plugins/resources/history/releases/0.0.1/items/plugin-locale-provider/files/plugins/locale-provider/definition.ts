import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { agentUILocaleConfig } from "../../agent-ui/i18n/locale-config";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { LocaleProviderPlugin } from "./index";
import { createAgentUILocaleService } from "./locale-service";
import manifestJson from "./manifest.json";

export const localeProviderPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: [AGENT_UI_LOCALE_SERVICE],
  setup: ({ services }) => {
    const locale = createAgentUILocaleService(agentUILocaleConfig.defaultLocale);
    services.provide(AGENT_UI_LOCALE_SERVICE, locale);
  },
  Component: LocaleProviderPlugin,
};

export default localeProviderPlugin;
