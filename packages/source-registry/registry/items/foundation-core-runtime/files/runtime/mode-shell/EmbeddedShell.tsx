import type { ReactNode } from "react";

export interface EmbeddedShellProps {
  children: ReactNode;
}

export function EmbeddedShell({ children }: EmbeddedShellProps) {
  return (
    <section
      className="agent-ui-embedded-shell"
      data-agent-ui-mode="embedded"
    >
      {children}
    </section>
  );
}
