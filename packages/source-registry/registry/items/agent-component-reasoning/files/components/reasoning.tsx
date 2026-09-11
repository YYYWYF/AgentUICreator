import type { CSSProperties, ReactNode, Ref } from "react";

import { cx } from "../foundation/cx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../primitives/collapsible";
import styles from "./reasoning.module.css";

export const AGENT_REASONING_ANIMATION_DURATION_MS = 200;

export type AgentReasoningStatus =
  | "running"
  | "completed"
  | "interrupted";

export type AgentReasoningVariant = "outline" | "ghost" | "muted";

export interface AgentReasoningProps {
  status: AgentReasoningStatus;
  expanded: boolean;
  streaming: boolean;
  onExpandedChange(expanded: boolean): void;
  onAnimationStart?(): void;
  variant?: AgentReasoningVariant;
  label: ReactNode;
  duration?: number;
  rootRef?: Ref<HTMLElement>;
  textViewportRef?: Ref<HTMLDivElement>;
  textContentRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function AgentReasoning({
  status,
  expanded,
  streaming,
  onExpandedChange,
  onAnimationStart,
  variant = "outline",
  label,
  duration,
  rootRef,
  textViewportRef,
  textContentRef,
  children,
  ariaLabel,
  className,
}: AgentReasoningProps) {
  return (
    <Collapsible
      open={expanded}
      onOpenChange={(nextExpanded) => {
        onAnimationStart?.();
        onExpandedChange(nextExpanded);
      }}
    >
      <section
        ref={rootRef}
        data-slot="agent-reasoning"
        data-status={status}
        data-expanded={expanded ? "true" : "false"}
        data-streaming={streaming ? "true" : "false"}
        data-variant={variant}
        aria-label={ariaLabel}
        className={cx(styles.root, className)}
        style={{
          "--agent-reasoning-animation-duration":
            `${AGENT_REASONING_ANIMATION_DURATION_MS}ms`,
        } as CSSProperties}
      >
        <CollapsibleTrigger
          render={<button data-slot="agent-reasoning-trigger" />}
          className={styles.trigger}
        >
          <span
            data-slot="agent-reasoning-trigger-icon"
            className={styles.triggerIcon}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M9.5 4.5A3.5 3.5 0 0 0 6 8v.2A3.8 3.8 0 0 0 4 11.5c0 1.3.7 2.5 1.8 3.2A3.5 3.5 0 0 0 9.5 19h.5V5z" />
              <path d="M14.5 4.5A3.5 3.5 0 0 1 18 8v.2a3.8 3.8 0 0 1 2 3.3c0 1.3-.7 2.5-1.8 3.2a3.5 3.5 0 0 1-3.7 4.3H14V5zM10 9H8m6 3h2m-6 3H8m6-6h2" />
            </svg>
          </span>
          <span
            data-slot="agent-reasoning-label"
            data-active={streaming ? "true" : "false"}
            className={styles.label}
          >
            {label}
            {duration !== undefined && duration > 0 ? ` (${duration}s)` : null}
          </span>
          <span data-slot="agent-reasoning-chevron" className={styles.chevron}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={styles.chevronIcon}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent
          render={<div data-slot="agent-reasoning-content" />}
          className={styles.content}
          aria-busy={streaming ? true : undefined}
        >
          <div
            aria-hidden="true"
            data-slot="agent-reasoning-fade-top"
            className={cx(styles.fade, styles.fadeTop)}
          />
          <div
            ref={textViewportRef}
            data-slot="agent-reasoning-text"
            className={styles.text}
          >
            <div
              ref={textContentRef}
              data-slot="agent-reasoning-text-content"
              className={styles.textContent}
            >
              {children}
            </div>
          </div>
          {streaming && expanded ? (
            <div
              aria-hidden="true"
              data-slot="agent-reasoning-fade-bottom"
              className={cx(styles.fade, styles.fadeBottom)}
            />
          ) : null}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
