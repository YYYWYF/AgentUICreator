/** Opt-in Generative UI API. Upstream implementation and styling stay inside this package. */
import { JSONGenerativeUI, createActionRegistry, type ActionRegistry, type GenerativeUILibrary } from "@assistant-ui/react-generative-ui";
import { styledGenerativeUILibrary } from "./internal/vendor-generated/assistant-ui/generative-ui/styled-generative-ui.js";
export type { GenerativeUILibrary, ActionRegistry };
export interface AgentUIGenerativeUIOptions {
  /** Entries extend or explicitly override the default vocabulary. */
  components?: GenerativeUILibrary;
  actions?: ActionRegistry;
}
export function createAgentUIGenerativeUI(options: AgentUIGenerativeUIOptions = {}) {
  return new JSONGenerativeUI({ library: { ...styledGenerativeUILibrary, ...options.components },
    ...(options.actions === undefined ? {} : { actions: options.actions }) });
}
export function createAgentUIGenerativeActions(handlers: Parameters<typeof createActionRegistry>[0]) {
  return createActionRegistry(handlers);
}
