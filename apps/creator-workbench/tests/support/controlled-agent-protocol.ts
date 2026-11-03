import type { ServerResponse } from "node:http";

export interface ControlledRunInput {
  threadId: string;
  runId: string;
  messages: { id: string; role: string; content?: unknown; toolCallId?: string; toolCalls?: unknown[] }[];
  resume?: unknown[];
}
export function writeEvent(response: ServerResponse, event: object) { response.write(`data: ${JSON.stringify(event)}\n\n`); }
export function startRun(response: ServerResponse, input: ControlledRunInput) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  writeEvent(response, { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
}
export function finishRun(response: ServerResponse, input: ControlledRunInput, text: string) {
  const messageId = `answer-${input.runId}`;
  writeEvent(response, { type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
  writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId, delta: text });
  writeEvent(response, { type: "TEXT_MESSAGE_END", messageId });
  writeEvent(response, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId });
  response.end();
}
