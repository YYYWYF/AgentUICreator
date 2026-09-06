import type { Interrupt, ResumeEntry } from "@ag-ui/core";
import type {
  AgentInterrupt,
  AgentInterruptResponse,
} from "@agent-ui/runtime-core";

export function mapAgUiInterrupt(interrupt: Interrupt): AgentInterrupt {
  return {
    id: interrupt.id,
    reason: interrupt.reason,
    producer: interrupt.subagentRunId === undefined
      ? { type: "root" }
      : { type: "subagent", id: interrupt.subagentRunId },
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

export function mapInterruptResponse(
  response: AgentInterruptResponse,
): ResumeEntry {
  return {
    interruptId: response.interruptId,
    status: response.status,
    ...(response.payload === undefined
      ? {}
      : { payload: structuredClone(response.payload) }),
    ...(response.metadata === undefined
      ? {}
      : { metadata: structuredClone(response.metadata) }),
  };
}
