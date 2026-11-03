import "./styles.css";
import { CanonicalAgentIdentityPlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import { agentIdentityConfig } from "./config";

export function AgentIdentityPlugin({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  return <Implementation {...agentIdentityConfig} {...props} />;
}
