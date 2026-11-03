import implementation from "@za38.03/agent-ui-plugins/locale-provider";
import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import { parseUIPluginManifest } from "@za38.03/agent-ui-plugins";
import { AGENT_UI_LOCALE_SERVICE } from "@za38.03/agent-ui-runtime/ui/services/agent-ui-locale";
import { LocaleProviderPlugin } from "./index";
import { createAgentUILocaleService } from "@za38.03/agent-ui-plugins/locale-provider";
import manifestJson from "./manifest.json";

export const localeProviderPlugin: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [AGENT_UI_LOCALE_SERVICE],
  setup: implementation.bindSetup(({ services }: Parameters<NonNullable<UIPluginDefinition["setup"]>>[0]) => {
    const locale = createAgentUILocaleService();
    services.provide(AGENT_UI_LOCALE_SERVICE, locale);
  }),
  Component: LocaleProviderPlugin,
};

export default localeProviderPlugin;
