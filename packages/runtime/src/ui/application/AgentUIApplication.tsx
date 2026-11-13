import { useState, type ReactNode } from "react";
import { AgentUIAgentProvider } from "../../host/AgentUIAgentsProvider.js";
import { AgentApplication, type AgentProps } from "./Agent.js";
import type { AgentUIProjectOptions } from "../project-context.js";
import { createRuntimeCompositionStore } from "../runtime/composition/RuntimeCompositionStore.js";

export interface AgentUIApplicationProps extends AgentProps {
  agentId: string;
  project: AgentUIProjectOptions;
  /** Controlled by the business UI; hiding preserves mounted conversations. */
  hidden?: boolean | undefined;
  /** Create per-Agent Host services. Their enabled Plugins own setup/cleanup. */
  createServices?: (() => Readonly<Record<string, unknown>>) | undefined;
  children?: ReactNode;
}

export function AgentUIApplication({ agentId, ...props }: AgentUIApplicationProps) {
  return <AgentUIAgentProvider key={JSON.stringify([agentId, props.endpoint ?? "/agent"])} agentId={agentId}>
    <AgentBody agentId={agentId} {...props} />
  </AgentUIAgentProvider>;
}

function AgentBody({ agentId, project, hidden, createServices, children, ...props }: AgentUIApplicationProps) {
  const [compositionStore] = useState(() => createRuntimeCompositionStore());
  const [services] = useState(() => createServices?.());
  // Share immutable models/definitions, never the mutable composition store.
  const isolatedProject = { ...project, compositionStore };
  return <div data-agent-ui-agent={agentId} hidden={hidden}>
    {children}
    <AgentApplication project={isolatedProject} {...props} services={{ ...services, ...props.services }} />
  </div>;
}
