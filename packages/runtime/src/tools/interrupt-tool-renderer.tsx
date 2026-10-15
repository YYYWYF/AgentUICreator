import { useSyncExternalStore, type ComponentType } from "react";
import { useConversationCanAnswerToolCall, type ConversationToolCallProps } from "@za38.03/agent-ui-react";
import { useConversationRuntimeBridge } from "../ConversationRuntimeBridgeContext.js";

/** One lifecycle owner: renderers observe the runtime and submit responses to it. */
export function createInterruptToolRenderer(Render: ComponentType<ConversationToolCallProps>) {
  return function InterruptToolRenderer(props: ConversationToolCallProps) {
    const { agentRuntime } = useConversationRuntimeBridge();
    const snapshot = useSyncExternalStore(agentRuntime.subscribe, agentRuntime.getSnapshot, agentRuntime.getSnapshot);
    const canAnswer = useConversationCanAnswerToolCall();
    const pending = snapshot.interrupts.find(item => item.toolExecutionId === props.toolCallId);
    const resumeInterrupt = pending && canAnswer && snapshot.run.status === "awaiting-input"
      ? (payload: unknown) => agentRuntime.resumeInterrupts([{
          interruptId: pending.id, status: "resolved", payload,
        }])
      : undefined;
    return <Render {...props} addResult={undefined} resumeInterrupt={resumeInterrupt}
      status={pending ? { type: "requires-action", reason: "interrupt" } : props.status} />;
  };
}
