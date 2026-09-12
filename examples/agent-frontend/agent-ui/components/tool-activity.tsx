import type { ReactNode } from "react";

import { cx } from "../foundation/cx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../primitives/collapsible";
import { Spinner } from "../primitives/spinner";
import styles from "./tool-activity.module.css";

export type AgentToolActivityStatus =
  | "running"
  | "completed"
  | "error"
  | "interrupted"
  | "requires-action";

interface AgentToolActivityBaseProps {
  status: AgentToolActivityStatus;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export interface AgentToolActivityFlatProps
  extends AgentToolActivityBaseProps {
  presentation: "flat";
}

export interface AgentToolActivityGroupedProps
  extends AgentToolActivityBaseProps {
  presentation: "grouped";
  summary: ReactNode;
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
}

export type AgentToolActivityProps =
  | AgentToolActivityFlatProps
  | AgentToolActivityGroupedProps;

function StatusGlyph({ status }: { status: Exclude<AgentToolActivityStatus, "running"> }) {
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

  if (status === "requires-action") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className={styles.statusIconGlyph}
      >
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 5.5v3" />
        <path d="M8 10.5h.01" />
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

export function AgentToolActivity(props: AgentToolActivityProps) {
  const { status, children, ariaLabel, className } = props;

  if (props.presentation === "flat") {
    return (
      <section
        data-slot="agent-tool-activity"
        data-presentation="flat"
        data-status={status}
        aria-label={ariaLabel}
        aria-busy={status === "running" ? true : undefined}
        className={cx(styles.root, className)}
      >
        <div data-slot="agent-tool-activity-items" className={styles.items}>
          {children}
        </div>
      </section>
    );
  }

  return (
    <Collapsible
      open={props.expanded}
      onOpenChange={(nextExpanded) => props.onExpandedChange(nextExpanded)}
    >
      <section
        data-slot="agent-tool-activity"
        data-presentation="grouped"
        data-status={status}
        data-expanded={props.expanded ? "true" : "false"}
        aria-label={ariaLabel}
        aria-busy={status === "running" ? true : undefined}
        className={cx(styles.root, className)}
      >
        <CollapsibleTrigger
          render={<button type="button" data-slot="agent-tool-activity-trigger" />}
          className={styles.trigger}
        >
          <span
            data-slot="agent-tool-activity-status-icon"
            className={styles.statusIcon}
          >
            {status === "running" ? <Spinner /> : <StatusGlyph status={status} />}
          </span>
          <span
            data-slot="agent-tool-activity-summary"
            className={styles.summary}
          >
            {props.summary}
          </span>
          <span
            data-slot="agent-tool-activity-chevron"
            className={styles.chevron}
          >
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
          keepMounted
          render={<div data-slot="agent-tool-activity-content" />}
          className={styles.content}
        >
          <div data-slot="agent-tool-activity-items" className={styles.items}>
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
