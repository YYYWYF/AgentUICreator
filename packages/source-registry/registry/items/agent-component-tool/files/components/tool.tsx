import type { ReactNode } from "react";

import { cx } from "../foundation/cx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../primitives/collapsible";
import { Spinner } from "../primitives/spinner";
import styles from "./tool.module.css";

export type AgentToolStatus =
  | "running"
  | "completed"
  | "error"
  | "interrupted";

export interface AgentToolProps {
  status: AgentToolStatus;
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
  name: ReactNode;
  summary?: ReactNode;
  statusLabel: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

function StatusGlyph({ status }: { status: AgentToolStatus }) {
  if (status === "completed") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className={styles.statusIconGlyph}
      >
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
    );
  }

  if (status === "error") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className={styles.statusIconGlyph}
      >
        <path d="m5 5 6 6" />
        <path d="m11 5-6 6" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={styles.statusIconGlyph}
    >
      <path d="m4.5 11.5 7-7" />
    </svg>
  );
}

export function AgentTool({
  status,
  expanded,
  onExpandedChange,
  name,
  summary,
  statusLabel,
  children,
  ariaLabel,
  className,
}: AgentToolProps) {
  return (
    <Collapsible
      open={expanded}
      onOpenChange={(nextExpanded) => onExpandedChange(nextExpanded)}
    >
      <section
        data-slot="agent-tool"
        data-status={status}
        data-expanded={expanded ? "true" : "false"}
        aria-label={ariaLabel}
        aria-busy={status === "running" ? true : undefined}
        className={cx(styles.root, className)}
      >
        <CollapsibleTrigger
          render={<button data-slot="agent-tool-trigger" />}
          className={styles.trigger}
        >
          <span data-slot="agent-tool-status-icon" className={styles.statusIcon}>
            {status === "running" ? <Spinner /> : <StatusGlyph status={status} />}
          </span>

          <span data-slot="agent-tool-identity" className={styles.identity}>
            <span data-slot="agent-tool-name" className={styles.name}>
              {name}
            </span>
            {summary === undefined ? null : (
              <span data-slot="agent-tool-summary" className={styles.summary}>
                {summary}
              </span>
            )}
          </span>

          <span data-slot="agent-tool-status" className={styles.status}>
            <span
              data-slot="agent-tool-status-label"
              className={styles.statusLabel}
            >
              {statusLabel}
            </span>
          </span>

          <span data-slot="agent-tool-chevron" className={styles.chevron}>
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className={styles.chevronIcon}
            >
              <path d="m6 3.5 4.5 4.5L6 12.5" />
            </svg>
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent
          render={<div data-slot="agent-tool-content" />}
          className={styles.content}
        >
          <div data-slot="agent-tool-body" className={styles.body}>
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
