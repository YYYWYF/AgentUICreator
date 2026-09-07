import type { AgentMessage } from "../../framework/contracts/ui-plugin";
import type { ToolPresentationItem } from "../../runtime/message-rendering";
import type { ToolCallInspection } from "../_shared/agent-ui-data";

type AgentAssistantMessage = Extract<AgentMessage, { role: "assistant" }>;

export type AssistantTurnPresentationSegment =
  | {
      kind: "message";
      id: string;
      message: AgentMessage;
    }
  | {
      kind: "tool-activity";
      id: string;
      items: readonly ToolPresentationItem[];
    };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasAssistantPresentationContent(
  message: AgentAssistantMessage,
): boolean {
  if (typeof message.content === "string" && message.content.length > 0) {
    return true;
  }
  if (Array.isArray(message.content) && message.content.length > 0) {
    return true;
  }

  const agentUI = asRecord(message.metadata?.agentUI);
  const sources = message.metadata?.sources ?? agentUI?.sources;
  return Array.isArray(sources) && sources.length > 0;
}

function toPresentationItem(
  inspection: ToolCallInspection,
): ToolPresentationItem {
  return {
    toolCall: inspection.toolCall,
    result: inspection.result,
    execution: inspection.execution,
    status: inspection.status,
  };
}

export function projectTurnToolActivities(
  messages: readonly AgentMessage[],
  toolInspectionById: ReadonlyMap<string, ToolCallInspection>,
): AssistantTurnPresentationSegment[] {
  const segments: AssistantTurnPresentationSegment[] = [];
  let activeItems: ToolPresentationItem[] | undefined;

  const flushToolActivity = () => {
    if (activeItems === undefined || activeItems.length === 0) return;
    segments.push({
      kind: "tool-activity",
      id: `tool-activity:${activeItems[0]!.toolCall.id}`,
      items: activeItems,
    });
    activeItems = undefined;
  };

  const pushMessage = (message: AgentMessage) => {
    flushToolActivity();
    segments.push({ kind: "message", id: message.id, message });
  };

  messages.forEach((message) => {
    if (message.role === "tool") {
      if (toolInspectionById.has(message.toolCallId)) return;
      pushMessage(message);
      return;
    }

    if (message.role !== "assistant") {
      pushMessage(message);
      return;
    }

    const toolCalls = message.toolCalls ?? [];
    const hasContent = hasAssistantPresentationContent(message);
    if (hasContent || toolCalls.length === 0) {
      pushMessage(message);
    }

    if (toolCalls.length === 0) return;
    activeItems ??= [];
    toolCalls.forEach((toolCall) => {
      const inspection = toolInspectionById.get(toolCall.id);
      activeItems!.push(
        inspection === undefined
          ? { toolCall, status: "abort" }
          : toPresentationItem(inspection),
      );
    });
  });

  flushToolActivity();
  return segments;
}
