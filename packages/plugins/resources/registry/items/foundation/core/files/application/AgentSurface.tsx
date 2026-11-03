import type { ComponentProps } from "react";
import { ProjectProvider } from "./project-config";
import { AgentSurface as PackageAgentSurface } from "@za38.03/agent-ui-runtime/ui";
export function AgentSurface(props: ComponentProps<typeof PackageAgentSurface>) { return <ProjectProvider><PackageAgentSurface {...props} /></ProjectProvider>; }
import { AgentEnvironment as PackageAgentEnvironment } from "@za38.03/agent-ui-runtime/ui";
export function AgentEnvironment(props: ComponentProps<typeof PackageAgentEnvironment>) { return <ProjectProvider><PackageAgentEnvironment {...props} /></ProjectProvider>; }
