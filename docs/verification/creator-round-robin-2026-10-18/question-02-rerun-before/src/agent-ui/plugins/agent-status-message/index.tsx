import { AgentStatusMessagePlugin as Implementation } from "@za38.03/agent-ui-plugins/agent-status-message";
import type { ComponentProps } from "react";

export function AgentStatusMessagePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
