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
  id(kind: "message" | "tool" | "subagent" | "interrupt", old: string): string {
    let map = this.maps.get(kind);
    if (!map) { map = new Map(); this.maps.set(kind, map); }
    let value = map.get(old);
    if (!value) { value = `${this.input.runId}:replay:${kind}:${map.size + 1}`; map.set(old, value); }
    return value;
  }
  fields(value: Record<string, unknown>): void {
    if (typeof value.threadId === "string") value.threadId = this.input.threadId;
    if (typeof value.runId === "string") value.runId = this.input.runId;
    // A recorded parent is a separate request identity, never the replay run itself.
    if ("parentRunId" in value) {
      if (this.input.parentRunId === undefined) delete value.parentRunId;
      else value.parentRunId = this.input.parentRunId;
    }
    const fields: Record<string, "message" | "tool" | "subagent"> = {
      messageId: "message", parentMessageId: "message",
      toolCallId: "tool", parentToolCallId: "tool", toolExecutionId: "tool",
      subagentRunId: "subagent", parentSubagentRunId: "subagent",
    };
    for (const [field, kind] of Object.entries(fields)) if (typeof value[field] === "string") value[field] = this.id(kind, value[field]);
  }
  messages(messages: unknown): void {
    if (!Array.isArray(messages)) return;
    for (const message of messages as Record<string, unknown>[]) {
      if (typeof message.id === "string") message.id = this.id("message", message.id);
      this.fields(message);
      if (Array.isArray(message.toolCalls)) for (const call of message.toolCalls as Record<string, unknown>[]) {
        if (typeof call.id === "string") call.id = this.id("tool", call.id);
      }
    }
  }
  event(event: AGUIEvent): AGUIEvent {
    const copy = structuredClone(event) as unknown as Record<string, unknown>;
    this.fields(copy);
    // Traverse only known protocol containers; application payload remains opaque.
    if (copy.type === "MESSAGES_SNAPSHOT") this.messages(copy.messages);
    if (copy.type === "REASONING_ENCRYPTED_VALUE" && typeof copy.entityId === "string") {
      copy.entityId = this.id(copy.subtype === "tool-call" ? "tool" : "message", copy.entityId);
    }
    if (copy.type === "RUN_STARTED" && typeof copy.input === "object" && copy.input !== null) {
      const input = copy.input as Record<string, unknown>;
      this.fields(input);
      this.messages(input.messages);
      if (Array.isArray(input.resume)) for (const resume of input.resume as Record<string, unknown>[]) {
        if (typeof resume.interruptId === "string") resume.interruptId = this.id("interrupt", resume.interruptId);
      }
    }
    if (copy.type === "SUBAGENT_FINISHED" && typeof copy.outcome === "object" && copy.outcome !== null) {
      const outcome = copy.outcome as Record<string, unknown>;
      if (Array.isArray(outcome.interruptIds)) outcome.interruptIds = outcome.interruptIds.map(id => this.id("interrupt", id as string));
    }
    if (copy.type === "RUN_FINISHED" && typeof copy.outcome === "object" && copy.outcome !== null) {
      const outcome = copy.outcome as Record<string, unknown>;
      if (Array.isArray(outcome.interrupts)) for (const interrupt of outcome.interrupts as Record<string, unknown>[]) {
        if (typeof interrupt.id === "string") interrupt.id = this.id("interrupt", interrupt.id);
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
