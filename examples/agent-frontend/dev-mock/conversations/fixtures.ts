import type {
  ConversationDetailResponse,
  ConversationHistoryMessageDto,
  ConversationListResponse,
  ConversationReplay,
  ConversationReplayMessageDto,
  ConversationSummary,
} from "../../services/conversations";

export interface MockConversationFixture {
  summary: ConversationSummary;
  detail: ConversationDetailResponse;
  sourceScenarioId?: string | undefined;
}

function legacyContent(message: ConversationReplayMessageDto): string {
  if (message.role === "user" || message.role === "system" || message.role === "developer") {
    return message.parts.map((part) => part.text).join("\n");
  }

  const text = message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  return text.length > 0 ? text : "历史助手消息包含结构化内容。";
}

function legacyMessages(replay: ConversationReplay): ConversationHistoryMessageDto[] {
  return replay.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: legacyContent(message),
    ...(message.metadata === undefined ? {} : { metadata: message.metadata }),
  }));
}

function detailFromReplay(
  id: string,
  title: string,
  replay: ConversationReplay,
): ConversationDetailResponse {
  return {
    id,
    title,
    messages: legacyMessages(replay),
    replay,
  };
}

const agentElementsReplay: ConversationReplay = {
  version: 1,
  messages: [
    {
      id: "replay-agent-elements-user",
      role: "user",
      parts: [{ type: "text", text: "请回放一次完整的 Agent Elements 分析。" }],
      createdAt: "2026-09-07T11:00:00Z",
    },
    {
      id: "replay-agent-elements-assistant",
      role: "assistant",
      parts: [
        {
          type: "reasoning",
          text: "我先整理计划、状态和并行子 Agent 的最终结果。",
        },
        {
          type: "tool-call",
          toolCallId: "replay-plan-1",
          toolName: "mock_agent_plan",
          args: {
            steps: [
              "Inspect current implementation",
              "Compare AG-UI runtime",
              "Update UI composition",
              "Run regression checks",
            ],
            activeIndex: 4,
          },
          result: { applied: true },
        },
        {
          type: "tool-call",
          toolCallId: "replay-status-1",
          toolName: "mock_agent_status",
          args: { label: "Analysis complete", elapsed: "0:24" },
          result: { applied: true },
        },
        {
          type: "tool-call",
          toolCallId: "replay-subagent-architecture",
          toolName: "mock_dispatch_subagent",
          args: {
            name: "Architecture Researcher",
            model: "mimo-v2.5-pro",
          },
          result: {
            name: "Architecture Researcher",
            model: "mimo-v2.5-pro",
            status: "completed",
            progress: 100,
          },
        },
        {
          type: "tool-call",
          toolCallId: "replay-subagent-runtime",
          toolName: "mock_dispatch_subagent",
          args: {
            name: "Runtime Inspector",
            model: "mimo-v2.5-pro",
          },
          result: {
            name: "Runtime Inspector",
            model: "mimo-v2.5-pro",
            status: "completed",
            progress: 100,
          },
        },
        {
          type: "tool-call",
          toolCallId: "replay-subagent-ui",
          toolName: "mock_dispatch_subagent",
          args: {
            name: "UI Reviewer",
            model: "mimo-v2.5-pro",
          },
          result: {
            name: "UI Reviewer",
            model: "mimo-v2.5-pro",
            status: "completed",
            progress: 100,
          },
        },
        {
          type: "text",
          text: "计划、状态、工具和子 Agent 检查都已完成。",
        },
      ],
      status: { type: "complete", reason: "stop" },
      createdAt: "2026-09-07T11:00:24Z",
      metadata: { replayFixture: "agent-elements" },
    },
  ],
};

const subagentsReplay: ConversationReplay = {
  version: 1,
  messages: [
    {
      id: "replay-subagents-user",
      role: "user",
      parts: [{ type: "text", text: "请并行检查当前 Agent UI 的架构、Runtime 和界面实现。" }],
      createdAt: "2026-09-07T11:00:30Z",
    },
    {
      id: "replay-subagents-assistant",
      role: "assistant",
      parts: [
        {
          type: "reasoning",
          text: "我把三个检查任务交给独立子 Agent。",
        },
        {
          type: "tool-call",
          toolCallId: "replay-subagents-architecture",
          toolName: "mock_dispatch_subagent",
          args: {
            name: "Architecture Researcher",
            model: "mimo-v2.5-pro",
          },
          result: {
            name: "Architecture Researcher",
            model: "mimo-v2.5-pro",
            status: "completed",
            progress: 100,
          },
        },
        {
          type: "tool-call",
          toolCallId: "replay-subagents-runtime",
          toolName: "mock_dispatch_subagent",
          args: {
            name: "Runtime Inspector",
            model: "mimo-v2.5-pro",
          },
          result: {
            name: "Runtime Inspector",
            model: "mimo-v2.5-pro",
            status: "completed",
            progress: 100,
          },
        },
        {
          type: "tool-call",
          toolCallId: "replay-subagents-ui",
          toolName: "mock_dispatch_subagent",
          args: {
            name: "UI Reviewer",
            model: "mimo-v2.5-pro",
          },
          result: {
            name: "UI Reviewer",
            model: "mimo-v2.5-pro",
            status: "completed",
            progress: 100,
          },
        },
        {
          type: "text",
          text: "三个子 Agent 的检查都已完成，结果已经汇总。",
        },
      ],
      status: { type: "complete", reason: "stop" },
      createdAt: "2026-09-07T11:00:36Z",
      metadata: { replayFixture: "subagents" },
    },
  ],
};

const reasoningToolReplay: ConversationReplay = {
  version: 1,
  messages: [
    {
      id: "replay-tool-user",
      role: "user",
      parts: [{ type: "text", text: "请检查项目中和 AG-UI 相关的文件。" }],
      createdAt: "2026-09-07T10:30:00Z",
    },
    {
      id: "replay-tool-assistant",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "我先检查当前项目中和 AG-UI 相关的实现。" },
        {
          type: "tool-call",
          toolCallId: "replay-search-files-1",
          toolName: "search_files",
          args: { keyword: "AG-UI" },
          result: {
            files: [
              "packages/runtime-conversation/src/ConversationRuntimeProvider.tsx",
              "packages/runtime-conversation/src/compatibility/conversation-execution-projector.ts",
            ],
          },
        },
        { type: "reasoning", text: "已经找到相关代码，我整理一下结果。" },
        {
          type: "text",
          text: "检查完成，我找到了 AG-UI Transport 和生命周期投影相关实现。",
        },
      ],
      status: { type: "complete", reason: "stop" },
      createdAt: "2026-09-07T10:30:08Z",
    },
  ],
};

const sourcesAttachmentsReplay: ConversationReplay = {
  version: 1,
  messages: [
    {
      id: "replay-sources-user",
      role: "user",
      parts: [{ type: "text", text: "请分析这个架构说明。" }],
      attachments: [{
        id: "replay-architecture-notes",
        type: "document",
        name: "architecture-notes.md",
        contentType: "text/markdown",
        url: "data:text/markdown,Agent%20UI%20architecture%20notes",
      }],
      createdAt: "2026-09-07T10:00:00Z",
    },
    {
      id: "replay-sources-assistant",
      role: "assistant",
      parts: [
        { type: "text", text: "我结合以下资料整理了架构说明。" },
        {
          type: "source",
          sourceType: "url",
          id: "source-ag-ui-runtime",
          title: "AG-UI Runtime Notes",
          url: "https://example.com/ag-ui-runtime",
        },
        {
          type: "source",
          sourceType: "document",
          id: "source-architecture-notes",
          title: "Architecture Notes",
          mediaType: "text/markdown",
          filename: "architecture-notes.md",
        },
      ],
      status: { type: "complete", reason: "stop" },
      createdAt: "2026-09-07T10:00:10Z",
    },
  ],
};

const toolErrorReplay: ConversationReplay = {
  version: 1,
  messages: [
    {
      id: "replay-tool-error-user",
      role: "user",
      parts: [{ type: "text", text: "请搜索不存在的架构文件。" }],
      createdAt: "2026-09-07T09:30:00Z",
    },
    {
      id: "replay-tool-error-assistant",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "我尝试搜索请求的文件。" },
        {
          type: "tool-call",
          toolCallId: "replay-search-files-error-1",
          toolName: "search_files",
          args: { keyword: "missing-architecture-notes" },
          result: { error: "No matching files were found." },
          isError: true,
        },
        { type: "text", text: "搜索失败：没有找到匹配的架构文件。" },
      ],
      status: {
        type: "incomplete",
        reason: "error",
        error: "search_files returned an error",
      },
      createdAt: "2026-09-07T09:30:04Z",
    },
  ],
};

function longConversationReplay(): ConversationReplay {
  const messages: ConversationReplayMessageDto[] = [];
  for (let index = 1; index <= 14; index += 1) {
    const sequence = String(index).padStart(2, "0");
    messages.push({
      id: `long-user-${sequence}`,
      role: "user",
      parts: [{ type: "text", text: `第 ${index} 步：继续检查 Conversation UI 的第 ${index} 个观察点。` }],
      createdAt: `2026-09-07T12:${sequence}:00Z`,
    });

    const assistantParts = index % 4 === 0
      ? [
          { type: "reasoning" as const, text: `我正在整理第 ${index} 步的检查结果。` },
          {
            type: "tool-call" as const,
            toolCallId: `long-tool-${sequence}`,
            toolName: "search_files",
            args: { keyword: `conversation-${sequence}` },
            result: { files: [`examples/agent-frontend/history-${sequence}.tsx`] },
          },
          { type: "text" as const, text: `第 ${index} 步检查完成。` },
        ]
      : index % 3 === 0
      ? [
          { type: "reasoning" as const, text: `第 ${index} 步使用已完成的历史数据继续推理。` },
          { type: "text" as const, text: `第 ${index} 步没有发现新的问题。` },
        ]
      : [{ type: "text" as const, text: `第 ${index} 步完成，状态保持稳定。` }];

    messages.push({
      id: `long-assistant-${sequence}`,
      role: "assistant",
      parts: assistantParts,
      status: { type: "complete", reason: "stop" },
      createdAt: `2026-09-07T12:${sequence}:30Z`,
    });
  }
  return { version: 1, messages };
}

const longReplay = longConversationReplay();

const legacyFixtures: MockConversationFixture[] = [
  {
    summary: {
      id: "conversation-agent-ui",
      title: "分析 Agent UI 架构",
      group: "今天",
      updatedAt: "2026-09-07T10:00:00Z",
    },
    detail: {
      id: "conversation-agent-ui",
      title: "分析 Agent UI 架构",
      messages: [
        {
          id: "agent-ui-message-1",
          role: "user",
          content: "帮我分析一下 Agent UI 架构。",
        },
        {
          id: "agent-ui-message-2",
          role: "assistant",
          content: "可以，我们先从 Agent Runtime、Frontend State 和 UI Plugin 的边界开始。",
        },
        {
          id: "agent-ui-message-3",
          role: "user",
          content: "历史会话应该进入 AG-UI Runtime 吗？",
        },
        {
          id: "agent-ui-message-4",
          role: "assistant",
          content: "不应该。历史详情是普通应用数据，只读展示时与 Live Runtime 消息保持分离。",
        },
      ],
    },
  },
  {
    summary: {
      id: "conversation-tool",
      title: "调试 Tool Loading",
      group: "今天",
      updatedAt: "2026-09-07T09:20:00Z",
    },
    detail: {
      id: "conversation-tool",
      title: "调试 Tool Loading",
      messages: [
        {
          id: "tool-message-1",
          role: "user",
          content: "为什么工具卡片一直显示加载中？",
        },
        {
          id: "tool-message-2",
          role: "assistant",
          content: "先确认 TOOL_CALL_START、ARGS、END 与 RESULT 是否完整到达。",
        },
        {
          id: "tool-message-3",
          role: "user",
          content: "Result 已经到达，但状态没有结束。",
        },
        {
          id: "tool-message-4",
          role: "assistant",
          content: "那需要检查 Frontend State 是否用同一个 toolCallId 完成对应 execution。",
        },
      ],
    },
  },
  {
    summary: {
      id: "conversation-mock",
      title: "设计 Mock Agent",
      group: "昨天",
      updatedAt: "2026-09-06T16:40:00Z",
    },
    detail: {
      id: "conversation-mock",
      title: "设计 Mock Agent",
      messages: [
        {
          id: "mock-message-1",
          role: "user",
          content: "我想在没有后端时调试 Agent 前端。",
        },
        {
          id: "mock-message-2",
          role: "assistant",
          content: "可以用 Mock Scenario 生成标准 AG-UI Event，继续经过真实 Transport。",
        },
        {
          id: "mock-message-3",
          role: "user",
          content: "会话历史也放进 Scenario 吗？",
        },
        {
          id: "mock-message-4",
          role: "assistant",
          content: "不用。会话列表和详情应由独立的普通 Mock Data API 提供。",
        },
      ],
    },
  },
];

export const mockConversationFixtures: readonly MockConversationFixture[] = [
  {
    summary: {
      id: "conversation-replay-agent-elements",
      title: "回放：Agent Elements",
      group: "P5-B 回放",
      updatedAt: "2026-09-07T11:00:24Z",
    },
    detail: detailFromReplay(
      "conversation-replay-agent-elements",
      "回放：Agent Elements",
      agentElementsReplay,
    ),
    sourceScenarioId: "agent-elements-showcase",
  },
  {
    summary: {
      id: "conversation-replay-subagents",
      title: "回放：Subagents",
      group: "P5-C2 回放",
      updatedAt: "2026-09-07T11:00:36Z",
    },
    detail: detailFromReplay(
      "conversation-replay-subagents",
      "回放：Subagents",
      subagentsReplay,
    ),
    sourceScenarioId: "subagents",
  },
  {
    summary: {
      id: "conversation-replay-tool",
      title: "回放：Reasoning + Tool",
      group: "P5-B 回放",
      updatedAt: "2026-09-07T10:30:08Z",
    },
    detail: detailFromReplay(
      "conversation-replay-tool",
      "回放：Reasoning + Tool",
      reasoningToolReplay,
    ),
    sourceScenarioId: "reasoning-tool-success",
  },
  {
    summary: {
      id: "conversation-replay-sources-attachments",
      title: "回放：Sources + Attachments",
      group: "P5-B 回放",
      updatedAt: "2026-09-07T10:00:10Z",
    },
    detail: detailFromReplay(
      "conversation-replay-sources-attachments",
      "回放：Sources + Attachments",
      sourcesAttachmentsReplay,
    ),
  },
  {
    summary: {
      id: "conversation-replay-tool-error",
      title: "回放：Tool Error",
      group: "P5-B 回放",
      updatedAt: "2026-09-07T09:30:04Z",
    },
    detail: detailFromReplay(
      "conversation-replay-tool-error",
      "回放：Tool Error",
      toolErrorReplay,
    ),
    sourceScenarioId: "tool-error",
  },
  {
    summary: {
      id: "conversation-replay-long-thread",
      title: "回放：长会话",
      group: "P5-B 回放",
      updatedAt: "2026-09-07T12:14:30Z",
    },
    detail: detailFromReplay(
      "conversation-replay-long-thread",
      "回放：长会话",
      longReplay,
    ),
  },
  ...legacyFixtures,
];

export const mockConversationDetails: ConversationDetailResponse[] =
  mockConversationFixtures.map((fixture) => fixture.detail);

export const mockConversationList: ConversationListResponse = {
  conversations: mockConversationFixtures.map((fixture) => fixture.summary),
};
