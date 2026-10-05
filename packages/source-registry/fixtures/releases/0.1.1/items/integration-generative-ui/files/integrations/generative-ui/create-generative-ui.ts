import { JSONGenerativeUI, createActionRegistry, type ActionRegistry } from "@assistant-ui/react-generative-ui";
import { styledGenerativeUILibrary } from "../../agent-ui/vendor/assistant-ui/generative-ui/styled-generative-ui";
import "../../agent-ui/vendor/assistant-ui/generative-ui/generative-ui.css";

export const agentUIGenerativeUILibrary = styledGenerativeUILibrary;

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
