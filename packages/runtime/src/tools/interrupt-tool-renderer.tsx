import { useSyncExternalStore, type ComponentType } from "react";
import { useConversationCanAnswerToolCall, type ConversationToolCallProps } from "@za38.03/agent-ui-plugins";
import { useConversationRuntimeBridge } from "../ConversationRuntimeBridgeContext.js";

/** One lifecycle owner: renderers observe the runtime and submit responses to it. */
export function createInterruptToolRenderer(Render: ComponentType<ConversationToolCallProps>) {
  return function InterruptToolRenderer(props: ConversationToolCallProps) {
    const { agentRuntime } = useConversationRuntimeBridge();
    const snapshot = useSyncExternalStore(agentRuntime.subscribe, agentRuntime.getSnapshot, agentRuntime.getSnapshot);
    const canAnswer = useConversationCanAnswerToolCall();
    const pending = snapshot.interrupts.find(item => item.toolExecutionId === props.toolCallId);
    const decisionRequest = agentRuntime.getCommandDecisionRequest(props.toolCallId);
    const resumeInterrupt = pending && canAnswer && snapshot.run.status === "awaiting-input"
      ? (payload: unknown) => agentRuntime.resumeInterrupts([{
          interruptId: pending.id, status: "resolved", payload,
        }])
      : undefined;
    const submitDecision = canAnswer && snapshot.run.status === "awaiting-input" &&
      (pending !== undefined || decisionRequest !== undefined)
      ? (decisionType: string) => {
          if (pending !== undefined) {
            return agentRuntime.resumeInterrupts([{
              interruptId: pending.id, status: "resolved", payload: decisionType,
            }]);
          }
          if (decisionRequest !== undefined) {
            return agentRuntime.submitCommandDecision(props.toolCallId, decisionType);
          }
          return Promise.reject(new Error("No pending decision for this tool call"));
        }
      : undefined;
    const awaitingDecision = pending !== undefined || decisionRequest !== undefined;
    return <Render {...props} addResult={undefined} resumeInterrupt={resumeInterrupt}
      decisionRequest={decisionRequest} submitDecision={submitDecision}
      status={awaitingDecision ? { type: "requires-action", reason: "interrupt" } : props.status} />;
  };
}
