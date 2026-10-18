import type { ReactNode } from "react";

export interface PlatformShellProps {
  children: ReactNode;
}

export function PlatformShell({ children }: PlatformShellProps) {
  return (
    <main
      className="agent-ui-platform-shell"
      data-agent-ui-mode="platform"
    >
      {children}
    </main>
  );
}
