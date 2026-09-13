import {
  useAuiState,
  type ToolCallMessagePartComponent,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";

import { AgentElementFrame } from "../../elements/AgentElementFrame";
import { SubagentList } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/subagent-list";
import { ToolFallback } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui";
import {
  isEligibleSubagentToolCall,
  projectSubagentToolCalls,
  type SubagentToolCallPart,
} from "../../agents/subagent-projection";
import { isSubagentDispatchTool } from "../tool-presentation";

type MockDispatchSubagentArgs = Record<string, unknown>;

function isSubagentToolCallPart(part: unknown): part is SubagentToolCallPart {
  return typeof part === "object" && part !== null &&
    "type" in part && part.type === "tool-call" &&
    "toolName" in part && typeof part.toolName === "string" &&
    isSubagentDispatchTool(part.toolName);
}

function SubagentAggregate({
  projection,
}: {
  projection: ReturnType<typeof projectSubagentToolCalls>;
}) {
  if (projection.view === null) return null;
  return (
    <SubagentList
      agents={projection.view.agents}
      completedCount={projection.view.completedCount}
      progress={projection.view.progress}
      showSummary={projection.view.showSummary}
      summaryAgent={projection.view.summaryAgent}
    />
  );
}

/**
 * Registers dispatch as a standalone assistant-ui tool. The toolkit renderer
 * owns the aggregate because the upstream Thread only exposes public tool UI
 * seams; the Thread itself does not know about subagent composition.
 */
export const MockDispatchSubagentToolUI: ToolCallMessagePartComponent<
  MockDispatchSubagentArgs,
  unknown
> = (props: ToolCallMessagePartProps<MockDispatchSubagentArgs, unknown>) => {
  const allParts = useAuiState((state) => state.message.parts);
  if (props.status.type === "requires-action" || !isEligibleSubagentToolCall(props)) {
    return <ToolFallback {...props} />;
  }

  const projection = projectSubagentToolCalls(
    allParts.filter(isSubagentToolCallPart),
  );
  if (!projection.eligibleToolCallIds.includes(props.toolCallId)) {
    return <ToolFallback {...props} />;
  }
  if (projection.eligibleToolCallIds[0] !== props.toolCallId) return null;
  if (projection.view === null) return <ToolFallback {...props} />;

  return (
    <AgentElementFrame kind="subagent-aggregate">
      <SubagentAggregate projection={projection} />
    </AgentElementFrame>
  );
};
