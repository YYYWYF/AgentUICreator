import type { UIPluginObservableService } from "../framework/contracts/ui-plugin.js";
import type { AgentUILocaleMessages } from "@za38.03/agent-ui-plugins";
import type {
  AgentUIDirection,
  AgentUILocaleCode,
} from "../agent-ui/i18n/locale-types.js";

export const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale" as const;

export interface AgentUILocaleSnapshot {
  locale: AgentUILocaleCode;
  direction: AgentUIDirection;
}

export interface AgentUILocaleService
  extends UIPluginObservableService<AgentUILocaleSnapshot> {
  setLocale(locale: AgentUILocaleCode): void;
  getMessages?(): AgentUILocaleMessages;
}

declare module "@za38.03/agent-ui-plugins/contracts" {
  interface UIPluginServiceMap {
    [AGENT_UI_LOCALE_SERVICE]: AgentUILocaleService;
  }
}
