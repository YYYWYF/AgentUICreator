import type {
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";

import {
  isEligibleSubagentToolCall,
} from "../../agents/subagent-projection";
import { ToolFallback } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui";

type MockDispatchSubagentArgs = Record<string, unknown>;

/**
 * Registers dispatch as a standalone assistant-ui tool without owning its
 * aggregate presentation. Invalid or unsafe dispatches stay on the official
 * fallback path; valid dispatches are rendered by ToolCallWrapper.
 */
export const MockDispatchSubagentToolUI: ToolCallMessagePartComponent<
  MockDispatchSubagentArgs,
  unknown
> = (props: ToolCallMessagePartProps<MockDispatchSubagentArgs, unknown>) => {
  if (!isEligibleSubagentToolCall(props)) {
    return <ToolFallback {...props} />;
  }

  return null;
};
