import { useAuiState } from "@assistant-ui/react";

export function AssistantUiRuntimeDebugOverlay() {
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const messages = useAuiState((state) => state.thread.messages);
  const lastMessage = messages.at(-1);
  const lastParts = lastMessage?.content ?? [];
  const runningTool = [...messages]
    .reverse()
    .flatMap((message) => [...message.content].reverse())
    .find(
      (part) =>
        part.type === "tool-call" &&
        part.result === undefined &&
        isRunning,
    );
  const reasoningParts = messages.reduce(
    (count, message) =>
      count + message.content.filter((part) => part.type === "reasoning").length,
    0,
  );

  const snapshot = {
    "thread.isRunning": isRunning,
    messageCount: messages.length,
    lastMessageRole: lastMessage?.role ?? null,
    lastMessageParts: lastParts.length,
    partTypes: lastParts.map((part) => part.type),
    runningTool:
      runningTool?.type === "tool-call" ? runningTool.toolName : null,
    reasoningParts,
  };

  return (
    <pre
      aria-label="assistant-ui runtime state"
      className="agent-ui-assistant-ui-debug"
      data-assistant-ui-spike-debug="true"
    >
      {JSON.stringify(snapshot, null, 2)}
    </pre>
  );
}
