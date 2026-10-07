import { AgentUIElement } from "./AgentUIElement";
export { AgentUIElement };
export type { AgentUIConfig } from "./config";
export type { AgentUIEventDetails } from "./events";
export function registerAgentUI(registry: CustomElementRegistry = customElements): void {
  const existing = registry.get("agent-ui");
  if (existing === undefined) registry.define("agent-ui", AgentUIElement);
}
registerAgentUI();
declare global {
  interface HTMLElementTagNameMap { "agent-ui": AgentUIElement }
}
