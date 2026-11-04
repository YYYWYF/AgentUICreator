import type { AgentUIShellProps } from "@za38.03/agent-ui-runtime/ui";

import "./platform-shell.css";

export type PlatformShellProps = AgentUIShellProps;

export function PlatformShell({ children, surfaceRef }: PlatformShellProps) {
  return (
    <main
      ref={surfaceRef}
      className="agent-ui-platform-shell"
    >
      {children}
    </main>
  );
}
