import { useAgentUILocale } from "@agent-ui/react";
import { useId, useState, type ReactNode } from "react";

import "./mode-shell.css";

export interface AssistantShellProps {
  children: ReactNode;
}

export function AssistantShell({ children }: AssistantShellProps) {
  const messages = useAgentUILocale("runtime");
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <section
      className="agent-ui-assistant-shell"
      data-agent-ui-mode="assistant"
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
        <span aria-hidden="true">{open ? "\u00d7" : "\u2726"}</span>
      </button>
    </section>
  );
}
