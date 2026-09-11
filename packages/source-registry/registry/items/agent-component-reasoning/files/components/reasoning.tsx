import type { ReactNode } from "react";

import { cx } from "../foundation/cx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../primitives/collapsible";
import { Spinner } from "../primitives/spinner";
import styles from "./reasoning.module.css";

export type AgentReasoningStatus =
  | "running"
  | "completed"
  | "interrupted";

export interface AgentReasoningProps {
  status: AgentReasoningStatus;
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
  label: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function AgentReasoning({
  status,
  expanded,
  onExpandedChange,
  label,
  children,
  ariaLabel,
  className,
}: AgentReasoningProps) {
  return (
    <Collapsible
      open={expanded}
      onOpenChange={(nextExpanded) => onExpandedChange(nextExpanded)}
    >
      <section
        data-slot="agent-reasoning"
        data-status={status}
        data-expanded={expanded ? "true" : "false"}
        aria-label={ariaLabel}
        aria-busy={status === "running" ? true : undefined}
        className={cx(styles.root, className)}
      >
        <CollapsibleTrigger
          render={<button data-slot="agent-reasoning-trigger" />}
          className={styles.trigger}
        >
          <span data-slot="agent-reasoning-status" className={styles.status}>
            {status === "running" ? <Spinner /> : null}
          </span>
          <span data-slot="agent-reasoning-label" className={styles.label}>
            {label}
          </span>
          <span data-slot="agent-reasoning-chevron" className={styles.chevron}>
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
          render={<div data-slot="agent-reasoning-content" />}
          className={styles.content}
        >
          <div data-slot="agent-reasoning-body" className={styles.body}>
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
