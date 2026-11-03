import { AgentUICompatibilityRoot } from "@za38.03/agent-ui-runtime/ui";
import type { ComponentProps } from "react";
import { ProjectProvider } from "../.generated/src/agent-ui/application/project-config";

/** Standalone distribution binds the same fixed producer and canonical Runtime. */
export function AgentUIBridgeRoot(props: ComponentProps<typeof AgentUICompatibilityRoot>) {
  return <ProjectProvider><AgentUICompatibilityRoot {...props} /></ProjectProvider>;
}
