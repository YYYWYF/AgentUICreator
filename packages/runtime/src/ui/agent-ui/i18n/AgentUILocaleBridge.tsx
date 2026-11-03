import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { AgentUILocaleProvider } from "@za38.03/agent-ui-plugins";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins/index.js";
import { AGENT_UI_LOCALE_SERVICE, type AgentUILocaleService } from "../../services/agent-ui-locale.js";
import { useAgentUIProject } from "../../project-context.js";

import type { AgentUILocaleCode } from "./locale-types.js";


/** Keeps the generated locale service authoritative while feeding product-owned React composition. */
export function AgentUILocaleBridge({ locale, onLocaleChange, children }: { locale?: AgentUILocaleCode | undefined; onLocaleChange?: ((locale: AgentUILocaleCode) => void) | undefined; children: ReactNode }) {
  const project = useAgentUIProject();
  const defaultSnapshot = project.localeSnapshot;
  const AGENT_UI_LOCALES = project.locales;
  const service = usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
  const snapshot = usePluginServiceSnapshot(service, defaultSnapshot);
  useLayoutEffect(() => { if (locale !== undefined) service?.setLocale(locale); }, [locale, service]);
  useEffect(() => { onLocaleChange?.(service?.getSnapshot().locale ?? locale ?? snapshot.locale); }, [service, locale, snapshot.locale, onLocaleChange]);
  return <AgentUILocaleProvider locale={locale ?? snapshot.locale} messages={AGENT_UI_LOCALES[locale ?? snapshot.locale]}>{children}</AgentUILocaleProvider>;
}
