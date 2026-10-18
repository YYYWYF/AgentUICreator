import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import {
  AGENT_UI_LOCALE_SERVICE,
  type AgentUILocaleService,
  type AgentUILocaleSnapshot,
} from "../../services/agent-ui-locale";
import { agentUILocaleConfig } from "./locale-config";
import { AGENT_UI_LOCALES, AGENT_UI_LOCALE_METADATA } from "./locale-registry";
import type { AgentUILocaleMessages } from "./locale-types";

const defaultLocale = agentUILocaleConfig.defaultLocale;
const defaultSnapshot: AgentUILocaleSnapshot = {
  locale: defaultLocale,
  direction: AGENT_UI_LOCALE_METADATA[defaultLocale].direction,
};

export function useAgentUILocale<K extends keyof AgentUILocaleMessages>(
  namespace: K,
): AgentUILocaleMessages[K] {
  const service = usePluginService<AgentUILocaleService>(
    AGENT_UI_LOCALE_SERVICE,
  );
  const { locale } = usePluginServiceSnapshot(service, defaultSnapshot);
  const messages: AgentUILocaleMessages = AGENT_UI_LOCALES[locale];

  return messages[namespace];
}
