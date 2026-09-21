export type ConversationToolPresentation =
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
 * Product-owned presentation metadata. The conversation registry still owns
 * whether a tool is standalone; this map only classifies the small set of
 * tools that participate in the Agent Trace composition.
 */
export const CONVERSATION_TOOL_PRESENTATION = {
  search_files: { kind: "ordinary" },
  mock_agent_plan: { kind: "agent-element", element: "plan" },
  mock_agent_status: { kind: "agent-element", element: "status" },
  // Legacy replay compatibility only; do not use for new live scenarios.
  mock_dispatch_subagent: { kind: "subagent-dispatch" },
} as const satisfies Readonly<Record<string, ConversationToolPresentation>>;

export function getConversationToolPresentation(
  toolName: string,
): ConversationToolPresentation | undefined {
  return CONVERSATION_TOOL_PRESENTATION[
    toolName as keyof typeof CONVERSATION_TOOL_PRESENTATION
  ];
}

export function isConversationSubagentDispatchTool(toolName: string): boolean {
  return getConversationToolPresentation(toolName)?.kind ===
    "subagent-dispatch";
}
