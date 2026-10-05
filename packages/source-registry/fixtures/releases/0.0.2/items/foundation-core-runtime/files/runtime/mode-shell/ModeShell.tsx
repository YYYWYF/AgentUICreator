import type { ReactNode } from "react";

import type { AgentUIMode } from "../../framework/contracts/agent-ui-mode";
import { AssistantShell } from "./AssistantShell";
import { EmbeddedShell } from "./EmbeddedShell";
import { PlatformShell } from "./PlatformShell";

export interface ModeShellProps {
  mode: AgentUIMode;
  children: ReactNode;
}

export function ModeShell({ mode, children }: ModeShellProps) {
  switch (mode) {
    case "assistant":
      return <AssistantShell>{children}</AssistantShell>;
    case "embedded":
      return <EmbeddedShell>{children}</EmbeddedShell>;
    case "platform":
      return <PlatformShell>{children}</PlatformShell>;
  }
}
