import type { AGUIMessage } from "../framework/contracts/ui-plugin";

/**
 * Stable conversation capability seam shared by providers and consumers.
 *
 * Concrete UI plugins provide this service through the plugin runtime. Other
 * plugins import this seam, then either inject it as a hard dependency or
 * probe it as an optional capability without importing a provider's source.
 */
export const AGENT_UI_CONVERSATION_SERVICE = "agent-ui.conversations";

export interface AgentUIConversationService {
  readonly activeKey: string | undefined;
  includesMessage(message: AGUIMessage): boolean;
}

declare module "../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [AGENT_UI_CONVERSATION_SERVICE]: AgentUIConversationService;
  }
}
