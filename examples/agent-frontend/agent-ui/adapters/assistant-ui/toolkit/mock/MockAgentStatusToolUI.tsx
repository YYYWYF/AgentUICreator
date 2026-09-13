import type {
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";

import { projectAgentStatus } from "../../agents/agent-status-projection";
import { AgentElementFrame } from "../../elements/AgentElementFrame";
import { AgentStatus } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/agent-status";
import { ToolFallback } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui";

type MockAgentStatusArgs = Record<string, unknown>;

function shouldUseFallback(
  props: ToolCallMessagePartProps<MockAgentStatusArgs, unknown>,
): boolean {
  return props.isError === true ||
    props.status.type === "requires-action" ||
    props.status.type === "incomplete";
}

export const MockAgentStatusToolUI: ToolCallMessagePartComponent<
  MockAgentStatusArgs,
  unknown
> = (props) => {
  const view = projectAgentStatus(props.result);
  if (shouldUseFallback(props) || view === null) {
    return <ToolFallback {...props} />;
  }
  return (
    <AgentElementFrame kind="status">
      <AgentStatus
        state={view.state}
        label={view.label}
        {...(view.elapsed === undefined ? {} : { elapsed: view.elapsed })}
      />
    </AgentElementFrame>
  );
};
