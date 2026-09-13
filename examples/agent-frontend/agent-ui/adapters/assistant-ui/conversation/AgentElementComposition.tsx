import type { PropsWithChildren } from "react";
import { useAuiState } from "@assistant-ui/react";

import { SubagentList } from "../../../vendor/assistant-ui/components/assistant-ui/elements/subagent-list";
import type { ThreadToolCallWrapperProps } from "../../../vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import {
  isEligibleSubagentToolCall,
  projectSubagentToolCalls,
  type SubagentToolCallPart,
} from "../agents/subagent-projection";
import {
  getAssistantUiToolPresentation,
  isSubagentDispatchTool,
} from "../toolkit/tool-presentation";

function isSubagentToolCallPart(part: unknown): part is SubagentToolCallPart {
  return typeof part === "object" && part !== null &&
    "type" in part && part.type === "tool-call" &&
    "toolName" in part && typeof part.toolName === "string" &&
    isSubagentDispatchTool(part.toolName);
}

function CompositionFrame({
  children,
  kind,
  className,
}: PropsWithChildren<{ kind: string; className: string }>) {
  return (
    <div data-agent-ui-composition-part={kind} className={className}>
      {children}
    </div>
  );
}

export type AssistantUiConversationPresentationMode = "live" | "history";

function SubagentAggregate({
  projection,
  mode,
}: {
  projection: ReturnType<typeof projectSubagentToolCalls>;
  mode: AssistantUiConversationPresentationMode;
}) {
  if (projection.view === null) return null;
  return (
    <SubagentList
      agents={projection.view.agents}
      completedCount={projection.view.completedCount}
      progress={projection.view.progress}
      showSummary={projection.view.showSummary}
      summaryAgent={projection.view.summaryAgent}
      className={mode === "history" ? "min-h-0" : undefined}
    />
  );
}

/**
 * Product-owned composition at the official assistant-ui ToolCallWrapper seam.
 * The official AssistantMessage remains responsible for message structure,
 * grouped parts, errors, actions, branch picking, and markdown export.
 */
export function createAssistantUiToolCallComposition(
  mode: AssistantUiConversationPresentationMode = "live",
) {
  return function AssistantUiToolCallComposition({
    children,
    part,
  }: ThreadToolCallWrapperProps) {
    const allParts = useAuiState((state) => state.message.parts);
    const presentation = getAssistantUiToolPresentation(part.toolName);

    if (presentation?.kind === "agent-element") {
      return (
        <CompositionFrame
          kind={presentation.element}
          className="my-3 w-fit max-w-full"
        >
          {children}
        </CompositionFrame>
      );
    }

    if (presentation?.kind === "subagent-dispatch") {
      const dispatchParts = allParts.filter(isSubagentToolCallPart);
      const projection = projectSubagentToolCalls(dispatchParts);
      const eligibleIds = new Set(projection.eligibleToolCallIds);

      // Invalid, errored, and approval-blocked dispatches remain visible through
      // the official ToolFallback supplied by Thread.
      if (
        !isEligibleSubagentToolCall(part) ||
        !eligibleIds.has(part.toolCallId)
      ) {
        return (
          <CompositionFrame
            kind="subagent-dispatch"
            className="my-1 w-fit max-w-full"
          >
            {children}
          </CompositionFrame>
        );
      }

      // One assistant message owns one aggregate. All other eligible dispatch
      // calls contribute data but do not render an extra fallback or card.
      if (projection.eligibleToolCallIds[0] !== part.toolCallId) return null;
      if (projection.view === null) {
        return (
          <CompositionFrame
            kind="subagent-dispatch"
            className="my-1 w-fit max-w-full"
          >
            {children}
          </CompositionFrame>
        );
      }
      return (
        <CompositionFrame
          kind="subagent-aggregate"
          className="my-3 mb-5 w-fit max-w-full"
        >
          <SubagentAggregate projection={projection} mode={mode} />
        </CompositionFrame>
      );
    }

    return (
      <CompositionFrame kind="tool-call" className="my-1">
        {children}
      </CompositionFrame>
    );
  };
}

export const AssistantUiToolCallComposition =
  createAssistantUiToolCallComposition();
