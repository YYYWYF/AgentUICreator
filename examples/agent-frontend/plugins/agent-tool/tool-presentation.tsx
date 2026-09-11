import type { AgentToolStatus } from "../../agent-ui/components/tool";
import type {
  AgentExecution,
  AgentMessage,
} from "../../framework/contracts/ui-plugin";

export type ToolResultMessage = Extract<AgentMessage, { role: "tool" }>;

export type ToolExecution = Extract<AgentExecution, { type: "tool" }>;

export const toolStatusLabels: Record<AgentToolStatus, string> = {
  running: "执行中",
  completed: "已完成",
  error: "失败",
  interrupted: "未完成",
};

export function parseToolValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function looksLikeFilePath(value: string): boolean {
  return value.includes("/") || /\.[a-z0-9]{1,8}$/iu.test(value);
}

export function resultCount(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const arrays = Object.values(value).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0]?.length : undefined;
}

export function resolveAgentToolStatus(
  result: ToolResultMessage | undefined,
  execution: ToolExecution | undefined,
  running: boolean,
): AgentToolStatus {
  switch (execution?.status) {
    case "preparing":
    case "awaiting-result":
      return "running";

    case "completed":
      return "completed";

    case "error":
      return "error";

    case "interrupted":
      return "interrupted";
  }

  if (result?.error !== undefined) {
    return "error";
  }

  if (result !== undefined) {
    return "completed";
  }

  return running ? "running" : "interrupted";
}

export function createToolSummary(
  status: AgentToolStatus,
  result: ToolResultMessage | undefined,
): string {
  if (status === "running") return "工具调用 · 正在执行";
  if (status === "error") return "工具调用 · 执行失败";
  if (status === "interrupted") return "工具调用 · 未返回结果";
  if (result === undefined) return "工具调用 · 已完成";

  const count = resultCount(parseToolValue(result.content));
  return count === undefined
    ? "工具调用 · 已返回结果"
    : `工具调用 · ${count} 个结果`;
}

function FileHintIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="agent-tool-plugin-file-icon"
    >
      <path d="M4.5 1.5h5L12.5 5v9.5h-8z" />
      <path d="M9.5 1.5V5h3" />
    </svg>
  );
}

function ScalarValue({ value }: { value: string | number | boolean | null }) {
  const text = value === null ? "null" : String(value);
  return (
    <span data-slot="agent-tool-value" className="agent-tool-plugin-value">
      {typeof value === "string" && looksLikeFilePath(value) ? (
        <FileHintIcon />
      ) : null}
      <code>{text}</code>
    </span>
  );
}

export function StructuredValue({ value }: { value: unknown }) {
  if (isScalar(value)) {
    return <ScalarValue value={value} />;
  }

  if (Array.isArray(value) && value.every(isScalar)) {
    return (
      <ul
        data-slot="agent-tool-value-list"
        className="agent-tool-plugin-value-list"
      >
        {value.map((item, index) => (
          <li key={`${String(item)}:${index}`}>
            <ScalarValue value={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (isRecord(value)) {
    return (
      <dl
        data-slot="agent-tool-value-object"
        className="agent-tool-plugin-object"
      >
        {Object.entries(value).map(([key, item]) => (
          <div
            data-slot="agent-tool-value-field"
            className="agent-tool-plugin-field"
            key={key}
          >
            <dt>{key}</dt>
            <dd>
              <StructuredValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <pre
      data-slot="agent-tool-raw-value"
      className="agent-tool-plugin-raw-value"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export interface ToolDetailsProps {
  argumentsText: string;
  result: ToolResultMessage | undefined;
  execution: ToolExecution | undefined;
  status: AgentToolStatus;
  showArguments: boolean;
  showResult: boolean;
}

export function ToolDetails({
  argumentsText,
  result,
  execution,
  status,
  showArguments,
  showResult,
}: ToolDetailsProps) {
  const error = result?.error ?? execution?.error?.message;

  return (
    <div data-slot="agent-tool-details" className="agent-tool-plugin-details">
      {showArguments ? (
        <section
          data-slot="agent-tool-detail-section"
          className="agent-tool-plugin-detail-section"
        >
          <h4
            data-slot="agent-tool-detail-heading"
            className="agent-tool-plugin-detail-heading"
          >
            输入
          </h4>
          <StructuredValue value={parseToolValue(argumentsText)} />
        </section>
      ) : null}

      {error !== undefined ? (
        <section
          data-slot="agent-tool-detail-section"
          className="agent-tool-plugin-detail-section"
        >
          <div
            data-slot="agent-tool-error"
            className="agent-tool-plugin-error"
          >
            <strong>工具执行失败</strong>
            <div>{error}</div>
          </div>
        </section>
      ) : !showResult ? null : result === undefined ? (
        <p data-slot="agent-tool-pending" className="agent-tool-plugin-pending">
          {status === "running" ? "等待工具返回结果…" : "工具没有返回结果"}
        </p>
      ) : (
        <section
          data-slot="agent-tool-detail-section"
          className="agent-tool-plugin-detail-section"
        >
          <h4
            data-slot="agent-tool-detail-heading"
            className="agent-tool-plugin-detail-heading"
          >
            输出
          </h4>
          <StructuredValue value={parseToolValue(result.content)} />
        </section>
      )}
    </div>
  );
}
