import type { RunAgentInput, ToolMessage } from "@ag-ui/core";

/** A selected Mock scenario also accepts result-only continuation requests. */
export function mockToolContinuationResults(input: RunAgentInput, toolName: string): (ToolMessage | undefined)[] {
  if (input.messages.length > 0 && input.messages.every(message => message.role === "tool")) {
    return input.messages as ToolMessage[];
  }
  const lastUser = input.messages.reduce((last, message, index) => message.role === "user" ? index : last, -1);
  const turn = input.messages.slice(lastUser + 1);
  const calls = turn.flatMap(message => message.role === "assistant" ? message.toolCalls ?? [] : [])
    .filter(call => call.function.name === toolName);
  return calls.map(call => turn.find((message): message is ToolMessage => message.role === "tool" && message.toolCallId === call.id));
}

/** Read the text receipt without serializing media parts into application JSON. */
export function toolMessageText(content: ToolMessage["content"]): string {
  return typeof content === "string" ? content : content.flatMap(part => part.type === "text" ? [part.text] : []).join("");
}
