import type { AgentToolDetailStatus } from "../../agent-ui/components/tool-detail";
import {
  asRecord,
  readableJSON,
  type InspectionStatus,
  type ToolCallInspection,
} from "../_shared/agent-ui-data";

export const toolDetailStatusMap: Record<
  InspectionStatus,
  AgentToolDetailStatus
> = {
  loading: "running",
  success: "completed",
  error: "error",
  abort: "interrupted",
};

export const toolDetailStatusLabels: Record<InspectionStatus, string> = {
  loading: "执行中",
  success: "已完成",
  error: "失败",
  abort: "未完成",
};

export function ToolCallIdentity({ toolCallId }: { toolCallId: string }) {
  return (
    <div className="agent-tool-detail-call-identity">
      <code>{toolCallId}</code>
      <button
        aria-label="复制 Tool Call ID"
        onClick={() => {
          void navigator.clipboard?.writeText(toolCallId);
        }}
        type="button"
      >
        复制
      </button>
    </div>
  );
}

function ToolDetailCodeBlock({
  content,
  label,
}: {
  content: string;
  label: string;
}) {
  return (
    <div className="agent-tool-detail-presentation">
      <div className="agent-tool-detail-presentation-label">{label}</div>
      <pre>{content}</pre>
    </div>
  );
}

export function ToolDetailArguments({ call }: { call: ToolCallInspection }) {
  return (
    <div data-slot="agent-tool-detail-arguments-presentation">
      <ToolDetailCodeBlock
        content={readableJSON(call.argumentsText)}
        label="Arguments"
      />
    </div>
  );
}

export function ToolDetailResult({ call }: { call: ToolCallInspection }) {
  const error = call.result?.error ?? call.execution?.error?.message;

  if (error !== undefined) {
    return (
      <div
        className="agent-tool-detail-result-error"
        data-tool-result-state="error"
        role="alert"
      >
        <strong>工具执行失败</strong>
        <div>{error}</div>
      </div>
    );
  }

  if (call.result === undefined) {
    return (
      <p
        className={
          call.status === "loading"
            ? "agent-tool-detail-result-pending"
            : "agent-tool-detail-result-empty"
        }
        data-tool-result-state={
          call.status === "loading" ? "pending" : "empty"
        }
      >
        {call.status === "loading"
          ? "等待工具返回结果…"
          : "工具没有返回结果"}
      </p>
    );
  }

  const agentUI = asRecord(call.result.metadata?.agentUI);
  if (agentUI?.render === "mermaid") {
    return (
      <div data-tool-result-render="mermaid-source">
        <ToolDetailCodeBlock content={call.result.content} label="Mermaid" />
      </div>
    );
  }

  return (
    <div data-tool-result-render="json">
      <ToolDetailCodeBlock
        content={readableJSON(call.result.content)}
        label="Result"
      />
    </div>
  );
}
