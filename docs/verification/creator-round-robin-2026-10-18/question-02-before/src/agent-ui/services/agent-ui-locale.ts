import type { UIPluginObservableService } from "../framework/contracts/ui-plugin";
import type {
  AgentUIDirection,
  AgentUILocaleCode,
} from "../agent-ui/i18n/locale-types";

export const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale" as const;

export interface AgentUILocaleSnapshot {
  locale: AgentUILocaleCode;
  direction: AgentUIDirection;
}

export interface AgentUILocaleService
  extends UIPluginObservableService<AgentUILocaleSnapshot> {
  setLocale(locale: AgentUILocaleCode): void;
}

declare module "../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [AGENT_UI_LOCALE_SERVICE]: AgentUILocaleService;
  }
}
