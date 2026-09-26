import { JSONGenerativeUI, defaultGenerativeUILibrary, createActionRegistry, type ActionRegistry } from "@assistant-ui/react-generative-ui";
import "./generative-ui.css";

export const agentUIGenerativeUILibrary = defaultGenerativeUILibrary;

/** Capabilities only: callers must separately authorize any Agent Tool. */
export function createAgentUIGenerativeUI(options?: { actions?: ActionRegistry }) {
  return new JSONGenerativeUI({
    library: agentUIGenerativeUILibrary,
    ...(options?.actions === undefined ? {} : { actions: options.actions }),
  });
}

export function createAgentUIGenerativeActions(handlers: Parameters<typeof createActionRegistry>[0]) {
  return createActionRegistry(handlers);
}
