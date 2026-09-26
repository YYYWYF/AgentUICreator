import { createConversationToolkit, type ConversationToolkit } from "@agent-ui/react";
import { createAgentUIGenerativeUI, createAgentUIGenerativeActions } from "../generative-ui";

/** Reuse only the official renderer, never its frontend tool capability. */
export function createA2uiConversationToolkit(options: {
  sendAction(action: Record<string, unknown>): void;
}): ConversationToolkit {
  const generative = createAgentUIGenerativeUI({
    actions: createAgentUIGenerativeActions({
      "a2ui:action": ({ payload }) => options.sendAction(payload),
    }),
  });
  const present = generative.present({ display: "standalone" });
  return createConversationToolkit({
    present: { type: "backend", display: "standalone", render: present.render! },
  });
}
