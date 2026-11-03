import type { ComponentProps } from "react";
import { ProjectProvider } from "./project-config";
import { ApplicationSessionBoundary as PackageApplicationSessionBoundary } from "@za38.03/agent-ui-runtime/ui";
export function ApplicationSessionBoundary(props: ComponentProps<typeof PackageApplicationSessionBoundary>) { return <ProjectProvider><PackageApplicationSessionBoundary {...props} /></ProjectProvider>; }
export { useApplicationSessionConnection, useApplicationSessionEpoch } from "@za38.03/agent-ui-runtime/ui";
