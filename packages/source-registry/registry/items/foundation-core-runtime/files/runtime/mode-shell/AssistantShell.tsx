import { useId, useState, type ReactNode } from "react";

import "./mode-shell.css";

export interface AssistantShellProps {
  children: ReactNode;
}

export function AssistantShell({ children }: AssistantShellProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <section
      className="agent-ui-assistant-shell"
      data-agent-ui-mode="assistant"
    >
      <div
        aria-label="Assistant"
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
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="agent-ui-assistant-trigger"
        onClick={() => setOpen((current) => !current)}
        title={open ? "Close assistant" : "Open assistant"}
        type="button"
      >
        <span aria-hidden="true">{open ? "\u00d7" : "\u2726"}</span>
      </button>
    </section>
  );
}
