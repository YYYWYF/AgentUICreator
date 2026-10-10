import { ActionBarMorePrimitive } from "@assistant-ui/react";
import { MoreHorizontalIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { TooltipIconButton } from "../adapters/assistant-ui/components/assistant-ui/elements/tooltip-icon-button.js";
import { useAgentUIPortalContainer } from "./AgentUIRoot.js";

/** Compose inside the existing response Footer; the Plugin supplies locale copy. */
export function ConversationActionMoreMenu({ label, children }: {
  label: string;
  children: ReactNode;
}): ReactElement {
  const container = useAgentUIPortalContainer();
  return <ActionBarMorePrimitive.Root>
    <ActionBarMorePrimitive.Trigger asChild>
      <TooltipIconButton tooltip={label} className="data-[state=open]:bg-accent"><MoreHorizontalIcon /></TooltipIconButton>
    </ActionBarMorePrimitive.Trigger>
    {container !== null && <ActionBarMorePrimitive.Content
      portalProps={container === undefined ? undefined : { container }}
      side="bottom" align="start" sideOffset={6}
      data-slot="agent-ui-message-action-menu"
      className="bg-popover text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5">
      {children}
    </ActionBarMorePrimitive.Content>}
  </ActionBarMorePrimitive.Root>;
}

export function ConversationActionMoreMenuItem({ children, disabled = false, onSelect }: {
  children: ReactNode;
  disabled?: boolean;
  onSelect?: (event: Event) => void;
}): ReactElement {
  return <ActionBarMorePrimitive.Item data-agent-ui-owned="" disabled={disabled} {...(onSelect === undefined ? {} : { onSelect })}
    className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none">
    {children}
  </ActionBarMorePrimitive.Item>;
}
