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
      : { responseSchema: interrupt.responseSchema }),
    ...(interrupt.expiresAt === undefined
      ? {}
      : { expiresAt: interrupt.expiresAt }),
    ...(interrupt.metadata === undefined
      ? {}
      : { metadata: interrupt.metadata }),
  };
}

export function mapInterruptResponse(
  response: AgentInterruptResponse,
): ResumeEntry {
  return {
    interruptId: response.interruptId,
    status: response.status,
    ...(response.payload === undefined ? {} : { payload: response.payload }),
    ...(response.metadata === undefined ? {} : { metadata: response.metadata }),
  };
}
