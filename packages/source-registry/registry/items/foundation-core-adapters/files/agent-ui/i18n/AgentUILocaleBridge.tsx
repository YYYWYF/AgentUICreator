import { useEffect, type ReactNode } from "react";
import { AgentUILocaleProvider } from "@agent-ui/react";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import { AGENT_UI_LOCALE_SERVICE, type AgentUILocaleService } from "../../services/agent-ui-locale";
import { AGENT_UI_LOCALES } from "./locale-registry";
import { agentUILocaleConfig } from "./locale-config";
import type { AgentUILocaleCode } from "./locale-types";

const defaultSnapshot = { locale: agentUILocaleConfig.defaultLocale, direction: "ltr" as const };
/** Keeps the generated locale service authoritative while feeding product-owned React composition. */
export function AgentUILocaleBridge({ locale, onLocaleChange, children }: { locale?: AgentUILocaleCode | undefined; onLocaleChange?: ((locale: AgentUILocaleCode) => void) | undefined; children: ReactNode }) {
  const service = usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
  const snapshot = usePluginServiceSnapshot(service, defaultSnapshot);
  useEffect(() => { if (locale !== undefined) service?.setLocale(locale); }, [locale, service]);
  useEffect(() => { onLocaleChange?.(locale ?? snapshot.locale); }, [locale, snapshot.locale, onLocaleChange]);
  return <AgentUILocaleProvider locale={locale ?? snapshot.locale} messages={AGENT_UI_LOCALES[locale ?? snapshot.locale]}>{children}</AgentUILocaleProvider>;
}
