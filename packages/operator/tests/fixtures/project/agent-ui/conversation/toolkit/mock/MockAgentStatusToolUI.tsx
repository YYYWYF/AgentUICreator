import type {
  ConversationToolCallComponent,
  ConversationToolCallProps,
} from "@za38.03/agent-ui-react";

import { projectAgentStatus } from "../../agents/agent-status-projection";
import { AgentElementFrame } from "../../elements/AgentElementFrame";
import { AgentStatus } from "@za38.03/agent-ui-react";
import { ConversationToolFallback } from "@za38.03/agent-ui-react";

function shouldUseFallback(
  props: ConversationToolCallProps,
): boolean {
  return props.isError === true ||
    props.status.type === "incomplete";
}

export const MockAgentStatusToolUI: ConversationToolCallComponent = (props) => {
  const view = projectAgentStatus(props.args, props.status);
  if (shouldUseFallback(props) || view === null) {
    return <ConversationToolFallback {...props} />;
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
