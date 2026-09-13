import type {
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";

import { projectSubagentList } from "../../agents/subagent-projection";
import { SubagentList } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/subagent-list";
import { ToolFallback } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui";

type MockSubagentsArgs = Record<string, unknown>;

function shouldUseFallback(
  props: ToolCallMessagePartProps<MockSubagentsArgs, unknown>,
): boolean {
  return props.isError === true ||
    props.status.type === "requires-action" ||
    props.status.type === "incomplete";
}

export const MockSubagentsToolUI: ToolCallMessagePartComponent<
  MockSubagentsArgs,
  unknown
> = (props) => {
  const view = projectSubagentList(props.result);
  if (shouldUseFallback(props) || view === null) {
    return <ToolFallback {...props} />;
  }
  return (
    <SubagentList
      agents={view.agents}
      completedCount={view.completedCount}
      progress={view.progress}
      showSummary={view.showSummary}
      summaryAgent={view.summaryAgent}
    />
  );
};
