import { useAgentUILocale } from "@za38.03/agent-ui-plugins";
import { BotIcon, ChevronDownIcon } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";

import type { AgentUIShellProps } from "@za38.03/agent-ui-runtime/ui";
import "./assistant-shell.css";

export type AssistantShellProps = AgentUIShellProps;

export function AssistantShell({ children, surfaceRef, assistantPanelWidth: panelWidth = 416 }: AssistantShellProps) {
  const messages = useAgentUILocale("runtime");
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <section
      className="agent-ui-assistant-shell"
      style={Number.isFinite(panelWidth) && panelWidth! > 0
        ? { "--agent-ui-assistant-panel-width": `${panelWidth}px` } as CSSProperties : undefined}
    >
      <div
        ref={open ? surfaceRef : undefined}
        aria-label={messages.assistant}
        className="agent-ui-assistant-panel"
        hidden={!open}
        id={panelId}
        role="complementary"
      >
        {children}
      </div>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={open ? messages.closeAssistant : messages.openAssistant}
        className="agent-ui-assistant-trigger"
        onClick={() => setOpen((current) => !current)}
        title={open ? messages.closeAssistant : messages.openAssistant}
        type="button"
      >
        {open ? <ChevronDownIcon aria-hidden="true" /> : <BotIcon aria-hidden="true" />}
      </button>
    </section>
  );
}
