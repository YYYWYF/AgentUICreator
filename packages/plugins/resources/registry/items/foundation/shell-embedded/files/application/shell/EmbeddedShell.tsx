import type { AgentUIShellProps } from "@za38.03/agent-ui-runtime/ui";

import "./embedded-shell.css";

export type EmbeddedShellProps = AgentUIShellProps;

export function EmbeddedShell({ children, surfaceRef }: EmbeddedShellProps) {
  return (
    <section
      ref={surfaceRef}
      className="agent-ui-embedded-shell"
    >
      {children}
    </section>
  );
}
