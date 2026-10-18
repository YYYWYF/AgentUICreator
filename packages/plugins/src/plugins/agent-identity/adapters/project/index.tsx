import "./styles.css";
import { CanonicalAgentIdentityPlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { agentIdentityConfig } from "./config";

export function AgentIdentityPlugin(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  return <Implementation config={agentIdentityConfig} {...props} />;
}
