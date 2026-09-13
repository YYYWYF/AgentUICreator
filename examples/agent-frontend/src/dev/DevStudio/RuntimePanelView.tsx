import type {
  AgentExecution,
  AgentMessage,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";
import type { ConversationObservationSnapshot } from "@agent-ui/runtime-assistant-ui";
import type { ReactNode } from "react";

import { Badge } from "../../../agent-ui/primitives/badge";
import { formatDebugValue } from "./runtime-debug-format";
import styles from "./dev-studio.module.css";

interface RuntimePanelViewProps<TState = unknown> {
  endpoint: string | undefined;
  mockEnabled: boolean;
  snapshot: AgentRuntimeSnapshot<TState>;
  assistantUiObservation: ConversationObservationSnapshot;
}

function roleLabel(role: AgentMessage["role"]): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function executionName(execution: AgentExecution): string {
  switch (execution.type) {
    case "reasoning":
      return "reasoning";
    case "tool":
    case "step":
    case "subagent":
      return execution.name;
  }
}

function executionTypeLabel(execution: AgentExecution): string {
  return execution.type;
}

function messageRoleCounts(messages: readonly AgentMessage[]): Array<[string, number]> {
  const counts = new Map<AgentMessage["role"], number>();
  for (const message of messages) {
    counts.set(message.role, (counts.get(message.role) ?? 0) + 1);
  }
  return Array.from(
    counts,
    ([role, count]): [string, number] => [roleLabel(role), count],
  );
}

function DefinitionRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={styles.definitionRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function RuntimePanelView<TState = unknown>({
  endpoint,
  mockEnabled,
  snapshot,
  assistantUiObservation,
}: RuntimePanelViewProps<TState>) {
  const roleCounts = messageRoleCounts(snapshot.messages);

  return (
    <div className={styles.panelContent}>
      <div className={styles.panelTitle}>
        <p className={styles.eyebrow}>Development tools</p>
        <h3>Runtime</h3>
      </div>

      <section className={styles.runtimeSection}>
        <h4>Environment</h4>
        <dl className={styles.definitionList}>
          <DefinitionRow
            label="Backend"
            value={mockEnabled ? "Mock Agent" : "Real Agent"}
          />
          <DefinitionRow
            label="Endpoint"
            value={<code className={styles.breakable}>{endpoint ?? "Unavailable"}</code>}
          />
        </dl>
      </section>

      <section className={styles.runtimeSection}>
        <h4>Conversation</h4>
        <dl className={styles.definitionList}>
          <DefinitionRow
            label="ID"
            value={<code className={styles.breakable}>{snapshot.conversation.id}</code>}
          />
        </dl>
      </section>

      <section className={styles.runtimeSection}>
        <h4>Run</h4>
        <dl className={styles.definitionList}>
          <DefinitionRow
            label="Status"
            value={<Badge variant={snapshot.run.status === "error" ? "danger" : "info"}>{snapshot.run.status}</Badge>}
          />
          {snapshot.run.id !== undefined ? (
            <DefinitionRow
              label="ID"
              value={<code className={styles.breakable}>{snapshot.run.id}</code>}
            />
          ) : null}
          {snapshot.run.error !== undefined ? (
            <DefinitionRow label="Error" value={snapshot.run.error.message} />
          ) : null}
        </dl>
      </section>

      <section className={styles.runtimeSection}>
        <h4>Messages</h4>
        <p className={styles.metric}>
          <strong>{snapshot.messages.length}</strong> messages
        </p>
        {roleCounts.length > 0 ? (
          <ul className={styles.compactList}>
            {roleCounts.map(([role, count]) => (
              <li key={role}>
                <span>{role}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={styles.runtimeSection}>
        <h4>Executions</h4>
        <p className={styles.metric}>
          <strong>{snapshot.executions.length}</strong> executions
        </p>
        {snapshot.executions.length > 0 ? (
          <ul className={styles.executionList}>
            {snapshot.executions.map((execution) => (
              <li key={execution.id}>
                <Badge variant="outline">{executionTypeLabel(execution)}</Badge>
                <span className={styles.executionName}>{executionName(execution)}</span>
                <span className={styles.executionStatus}>{execution.status}</span>
                <code className={styles.executionId}>{execution.id}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={styles.runtimeSection}>
        <h4>Interrupts</h4>
        <p className={styles.metric}>
          <strong>{snapshot.interrupts.length}</strong> interrupts
        </p>
        {snapshot.interrupts.length > 0 ? (
          <ul className={styles.interruptList}>
            {snapshot.interrupts.map((interrupt) => (
              <li key={interrupt.id}>
                <code className={styles.breakable}>{interrupt.id}</code>
                <span>{interrupt.reason}</span>
                {interrupt.toolExecutionId !== undefined ? (
                  <small>Tool execution: {interrupt.toolExecutionId}</small>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {snapshot.state !== undefined ? (
        <section className={styles.runtimeSection}>
          <h4>Application State</h4>
          <pre className={styles.json}>{formatDebugValue(snapshot.state)}</pre>
        </section>
      ) : null}

      <details className={styles.rawSnapshot}>
        <summary>Raw Snapshot</summary>
        <div className={styles.rawSnapshotBody}>
          <h4>AgentRuntime</h4>
          <pre className={styles.json}>{formatDebugValue(snapshot)}</pre>
          <h4>assistant-ui</h4>
          <pre className={styles.json}>{formatDebugValue(assistantUiObservation)}</pre>
        </div>
      </details>
    </div>
  );
}
