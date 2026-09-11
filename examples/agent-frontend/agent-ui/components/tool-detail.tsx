import type { ReactNode } from "react";

import { cx } from "../foundation/cx";
import { Spinner } from "../primitives/spinner";
import styles from "./tool-detail.module.css";

export type AgentToolDetailStatus =
  | "running"
  | "completed"
  | "error"
  | "interrupted";

interface AgentToolDetailBaseProps {
  title: ReactNode;
  meta?: ReactNode;
  selector?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export interface AgentToolDetailEmptyProps extends AgentToolDetailBaseProps {
  state: "empty";
  emptyState: ReactNode;
}

export interface AgentToolDetailSelectedProps extends AgentToolDetailBaseProps {
  state: "selected";
  status: AgentToolDetailStatus;
  name: ReactNode;
  statusLabel: ReactNode;
  toolCallId?: ReactNode;
  argumentsContent?: ReactNode;
  resultContent?: ReactNode;
}

export type AgentToolDetailProps =
  | AgentToolDetailEmptyProps
  | AgentToolDetailSelectedProps;

function StatusGlyph({
  status,
}: {
  status: Exclude<AgentToolDetailStatus, "running">;
}) {
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

export function AgentToolDetail(props: AgentToolDetailProps) {
  const { title, meta, selector, ariaLabel, className } = props;
  const status = props.state === "selected" ? props.status : undefined;

  return (
    <section
      data-slot="agent-tool-detail"
      data-state={props.state}
      data-status={status}
      aria-label={ariaLabel}
      aria-busy={status === "running" ? true : undefined}
      className={cx(styles.root, className)}
    >
      <header data-slot="agent-tool-detail-header" className={styles.header}>
        <div data-slot="agent-tool-detail-title" className={styles.title}>
          {title}
        </div>
        {meta === undefined ? null : (
          <div data-slot="agent-tool-detail-meta" className={styles.meta}>
            {meta}
          </div>
        )}
      </header>

      <div data-slot="agent-tool-detail-content" className={styles.content}>
        {selector === undefined ? null : (
          <div
            data-slot="agent-tool-detail-selector"
            className={styles.selector}
          >
            {selector}
          </div>
        )}

        {props.state === "empty" ? (
          <div data-slot="agent-tool-detail-empty" className={styles.empty}>
            {props.emptyState}
          </div>
        ) : (
          <>
            <div
              data-slot="agent-tool-detail-summary"
              className={styles.summary}
            >
              <span
                data-slot="agent-tool-detail-status-icon"
                className={styles.statusIcon}
              >
                {props.status === "running" ? (
                  <Spinner />
                ) : (
                  <StatusGlyph status={props.status} />
                )}
              </span>
              <div
                data-slot="agent-tool-detail-name"
                className={styles.name}
              >
                {props.name}
              </div>
              <div
                data-slot="agent-tool-detail-status-label"
                className={styles.statusLabel}
              >
                {props.statusLabel}
              </div>
            </div>

            {props.toolCallId === undefined ? null : (
              <div
                data-slot="agent-tool-detail-call-id"
                className={styles.callId}
              >
                {props.toolCallId}
              </div>
            )}

            {props.argumentsContent === undefined ? null : (
              <div
                data-slot="agent-tool-detail-arguments"
                className={styles.sectionContent}
              >
                {props.argumentsContent}
              </div>
            )}

            {props.resultContent === undefined ? null : (
              <div
                data-slot="agent-tool-detail-result"
                className={styles.sectionContent}
              >
                {props.resultContent}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
