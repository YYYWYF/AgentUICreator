import { createConversationToolkit, useConversationState, useConversationCanAnswerToolCall, type ConversationToolkit } from "@agent-ui/react";
import type { ComponentProps } from "react";
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
  const Render = present.render!;
  function Surface(props: ComponentProps<typeof Render>) {
    const isLast = useConversationState(state => state.message.isLast === true);
    const canAnswer = useConversationCanAnswerToolCall();
    return <fieldset disabled={!isLast || !canAnswer} className="m-0 min-w-0 border-0 p-0">
      <Render {...props} />
    </fieldset>;
  }
  return createConversationToolkit({
    present: { type: "backend", display: "standalone", render: Surface },
  });
}
