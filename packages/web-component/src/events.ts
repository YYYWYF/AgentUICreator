export interface AgentUIEventDetails {
  ready: { threadId: string };
  "thread-change": { threadId: string };
  error: { code: "AGENT_UI_CONFIG_ERROR" | "AGENT_UI_RUNTIME_ERROR"; error: Error };
}
export type AgentUIEmit = <K extends keyof AgentUIEventDetails>(type: K, detail: AgentUIEventDetails[K]) => void;
export function dispatchAgentUIEvent<K extends keyof AgentUIEventDetails>(element: HTMLElement, type: K, detail: AgentUIEventDetails[K]): void {
  element.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}
