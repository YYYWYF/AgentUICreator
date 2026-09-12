import type {
  AgentInterrupt,
  AgentInterruptResponse,
} from "@agent-ui/runtime-core";
import type {
  AgUiInterrupt,
  AgUiResumeEntry,
} from "@assistant-ui/react-ag-ui";

export function mapAssistantUiInterrupt(
  interrupt: AgUiInterrupt,
): AgentInterrupt {
  return {
    id: interrupt.id,
    reason: interrupt.reason,
    producer: { type: "root" },
    ...(interrupt.message === undefined ? {} : { message: interrupt.message }),
    ...(interrupt.toolCallId === undefined
      ? {}
      : { toolExecutionId: interrupt.toolCallId }),
    ...(interrupt.responseSchema === undefined
      ? {}
      : { responseSchema: structuredClone(interrupt.responseSchema) }),
    ...(interrupt.expiresAt === undefined
      ? {}
      : { expiresAt: interrupt.expiresAt }),
    ...(interrupt.metadata === undefined
      ? {}
      : { metadata: structuredClone(interrupt.metadata) }),
  };
}

export function mapAssistantUiInterruptResponse(
  response: AgentInterruptResponse,
): AgUiResumeEntry {
  return {
    interruptId: response.interruptId,
    status: response.status,
    ...(response.payload === undefined
      ? {}
      : { payload: structuredClone(response.payload) }),
  };
}
