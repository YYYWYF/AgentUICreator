import { useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import { AgentUILocaleProvider, mergeAgentUILocaleOverrides } from "../../../locale.js";
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
  const messages = useMemo(() => mergeAgentUILocaleOverrides(
    service?.getMessages?.(), AGENT_UI_LOCALES[locale ?? snapshot.locale],
  ), [service, snapshot, locale, AGENT_UI_LOCALES]);
  useLayoutEffect(() => { if (locale !== undefined) service?.setLocale(locale); service?.setMessages?.(project.locales); }, [locale, service, project.locales]);
  useEffect(() => { onLocaleChange?.(service?.getSnapshot().locale ?? locale ?? snapshot.locale); }, [service, locale, snapshot.locale, onLocaleChange]);
  return <AgentUILocaleProvider locale={locale ?? snapshot.locale} messages={messages}>{children}</AgentUILocaleProvider>;
}
