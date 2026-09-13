export type AssistantUiToolPresentation =
  | {
      readonly kind: "ordinary";
    }
  | {
      readonly kind: "agent-element";
      readonly element: "plan" | "status";
    }
  | {
      readonly kind: "subagent-dispatch";
    };

/**
 * Product-owned presentation metadata. The assistant-ui registry still owns
 * whether a tool is standalone; this map only classifies the small set of
 * tools that participate in the Agent Trace composition.
 */
export const ASSISTANT_UI_TOOL_PRESENTATION = {
  search_files: { kind: "ordinary" },
  mock_agent_plan: { kind: "agent-element", element: "plan" },
  mock_agent_status: { kind: "agent-element", element: "status" },
  mock_dispatch_subagent: { kind: "subagent-dispatch" },
} as const satisfies Readonly<Record<string, AssistantUiToolPresentation>>;

export function getAssistantUiToolPresentation(
  toolName: string,
): AssistantUiToolPresentation | undefined {
  return ASSISTANT_UI_TOOL_PRESENTATION[
    toolName as keyof typeof ASSISTANT_UI_TOOL_PRESENTATION
  ];
}

export function isSubagentDispatchTool(toolName: string): boolean {
  return getAssistantUiToolPresentation(toolName)?.kind ===
    "subagent-dispatch";
}
