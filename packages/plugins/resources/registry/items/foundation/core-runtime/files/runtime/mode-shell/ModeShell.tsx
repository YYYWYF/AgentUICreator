import type { AgentUIShellProps } from "@za38.03/agent-ui-runtime/ui";
import { AssistantShell } from "./AssistantShell";
import { EmbeddedShell } from "./EmbeddedShell";
import { PlatformShell } from "./PlatformShell";
/** Legacy local imports only; new projects install one shell without this router. */
export function ModeShell(props: AgentUIShellProps) {
  switch (props.mode) {
    case "assistant": return <AssistantShell {...props} />;
    case "embedded": return <EmbeddedShell {...props} />;
    case "platform": return <PlatformShell {...props} />;
  }
}
