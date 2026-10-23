import { useAgentUILocale } from "@za38.03/agent-ui-plugins";
import { BotIcon, ChevronDownIcon } from "lucide-react";
import { useId, useState, type ReactNode, type CSSProperties } from "react";

import "./mode-shell.css";

export interface AssistantShellProps {
  children: ReactNode;
  panelWidth?: number | undefined;
}

export function AssistantShell({ children, panelWidth }: AssistantShellProps) {
  const messages = useAgentUILocale("runtime");
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <section
      className="agent-ui-assistant-shell"
      data-agent-ui-mode="assistant"
      style={Number.isFinite(panelWidth) && panelWidth! > 0
        ? { "--agent-ui-assistant-panel-width": `${panelWidth}px` } as CSSProperties : undefined}
    >
      <div
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
