import { useAssistantUiRuntimeObservation } from "@agent-ui/runtime-assistant-ui";

export function AssistantUiRuntimeDebugOverlay() {
  const snapshot = useAssistantUiRuntimeObservation();

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
