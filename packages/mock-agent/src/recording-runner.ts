import type { AGUIEvent, RunAgentInput } from "@ag-ui/core";
import { validateMockRecording, type MockRecording } from "./recording.js";
import { normalizeTimingScale, waitForDelay } from "./timing.js";

export interface MockRecordingRunnerOptions {
  signal?: AbortSignal | undefined;
  timingScale?: number | undefined;
}

/** Only protocol identity locations are changed; arbitrary state, args and payload are opaque. */
class RecordingIdentityMap {
  private readonly maps = new Map<string, Map<string, string>>();
  constructor(private readonly input: RunAgentInput) {}
  id(kind: string, old: string): string {
    if (kind === "thread") return this.input.threadId;
    if (kind === "run") return this.input.runId;
    let map = this.maps.get(kind);
    if (!map) { map = new Map(); this.maps.set(kind, map); }
    let value = map.get(old);
    if (!value) { value = `${this.input.runId}:replay:${kind}:${map.size + 1}`; map.set(old, value); }
    return value;
  }
  fields(value: Record<string, unknown>): void {
    const fields: Record<string, string> = {
      threadId: "thread", runId: "run", parentRunId: "run",
      messageId: "message", parentMessageId: "message",
      toolCallId: "tool", parentToolCallId: "tool", toolExecutionId: "tool",
      subagentRunId: "subagent", parentSubagentRunId: "subagent",
    };
    for (const [field, kind] of Object.entries(fields)) if (typeof value[field] === "string") value[field] = this.id(kind, value[field]);
  }
  event(event: AGUIEvent): AGUIEvent {
    const copy = structuredClone(event) as unknown as Record<string, unknown>;
    this.fields(copy);
    // Message snapshots contain protocol identities rather than application payload.
    if (copy.type === "MESSAGES_SNAPSHOT" && Array.isArray(copy.messages)) {
      for (const message of copy.messages as Record<string, unknown>[]) {
        if (typeof message.id === "string") message.id = this.id("message", message.id);
        this.fields(message);
        if (Array.isArray(message.toolCalls)) for (const call of message.toolCalls as Record<string, unknown>[]) {
          if (typeof call.id === "string") call.id = this.id("tool", call.id);
        }
      }
    }
    if (copy.type === "RUN_FINISHED" && typeof copy.outcome === "object" && copy.outcome !== null) {
      const outcome = copy.outcome as Record<string, unknown>;
      if (Array.isArray(outcome.interrupts)) for (const interrupt of outcome.interrupts as Record<string, unknown>[]) {
        this.fields(interrupt);
        if (typeof interrupt.producer === "object" && interrupt.producer !== null) this.fields(interrupt.producer as Record<string, unknown>);
      }
    }
    return copy as unknown as AGUIEvent;
  }
}

export async function* runMockRecording(input: RunAgentInput, recording: MockRecording, options: MockRecordingRunnerOptions = {}): AsyncGenerator<AGUIEvent> {
  validateMockRecording(recording);
  const identities = new RecordingIdentityMap(input);
  const scale = normalizeTimingScale(options.timingScale);
  let previous = 0;
  for (const entry of recording.events) {
    if (!await waitForDelay(entry.atMs - previous, options.signal, scale)) return;
    if (options.signal?.aborted) return;
    yield identities.event(entry.event);
    previous = entry.atMs;
  }
}
