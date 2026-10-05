import type {
  ConversationToolCallComponent,
  ConversationToolCallProps,
} from "@agent-ui/react";

import { projectAgentStatus } from "../../agent-ui/conversation/agents/agent-status-projection";
import { AgentStatus } from "@agent-ui/react";
import { ConversationToolFallback } from "@agent-ui/react";

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
    <div data-agent-ui-composition-part="status">
      <AgentStatus
        state={view.state}
        label={view.label}
        {...(view.elapsed === undefined ? {} : { elapsed: view.elapsed })}
      />
    </div>
  );
};
