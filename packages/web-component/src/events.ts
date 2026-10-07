export type { AgentUIEventDetails, AgentUIEmit } from "../.generated/src/agent-ui/application/compatibility-config";
import type { AgentUIEventDetails } from "../.generated/src/agent-ui/application/compatibility-config";
export function dispatchAgentUIEvent<K extends keyof AgentUIEventDetails>(element: HTMLElement, type: K, detail: AgentUIEventDetails[K]): void {
  element.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}
