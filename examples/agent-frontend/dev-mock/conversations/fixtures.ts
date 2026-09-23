import type {
  ConversationDetailResponse,
  ConversationListResponse,
  ConversationSummary,
} from "../../services/conversations";

export interface MockConversationFixture {
  summary: ConversationSummary;
  detail: ConversationDetailResponse;
  /** Development documentation only; it is never consumed by the Runtime. */
  sourceScenarioId?: string | undefined;
}

function longHistoryMessages(): unknown[] {
  const messages: unknown[] = [];
  for (let index = 1; index <= 14; index += 1) {
    const sequence = String(index).padStart(2, "0");
    messages.push(
      {
        id: `long-human-${sequence}`,
        type: "human",
        content: `第 ${index} 步：继续检查 Conversation UI 的第 ${index} 个观察点。`,
      },
      {
        id: `long-ai-${sequence}`,
        type: "ai",
        content: `第 ${index} 步完成，状态保持稳定。`,
      },
    );
  }
  return messages;
}

export const mockConversationFixtures: readonly MockConversationFixture[] = [
  {
    summary: {
      id: "mock-history-basic",
      title: "历史：基础会话",
      group: "Mock History",
      updatedAt: "2026-09-07T10:00:00Z",
    },
    detail: {
      id: "mock-history-basic",
      title: "历史：基础会话",
      state: {
        values: {
          messages: [
            {
              id: "basic-human-1",
              type: "human",
              content: "帮我分析一下 Agent UI 架构。",
            },
            {
              id: "basic-ai-1",
              type: "ai",
              content: "可以，我们先从 Runtime、Frontend State 和 UI Plugin 的边界开始。",
            },
          ],
        },
      },
    },
  },
  {
    summary: {
      id: "mock-history-tool",
      title: "历史：已完成工具调用",
      group: "Mock History",
      updatedAt: "2026-09-07T10:30:00Z",
    },
    detail: {
      id: "mock-history-tool",
      title: "历史：已完成工具调用",
      state: {
        values: {
          messages: [
            {
              id: "tool-human-1",
              type: "human",
              content: "请检查项目中和 AG-UI 相关的文件。",
            },
            {
              id: "tool-ai-1",
              type: "ai",
              content: "",
              tool_calls: [{
                id: "history-search-files-1",
                name: "search_files",
                args: { keyword: "AG-UI" },
              }],
            },
            {
              id: "tool-result-1",
              type: "tool",
              tool_call_id: "history-search-files-1",
              name: "search_files",
              status: "success",
              content: JSON.stringify({
                files: [
                  "packages/runtime-conversation/src/ConversationRuntimeProvider.tsx",
                ],
              }),
            },
            {
              id: "tool-ai-2",
              type: "ai",
              content: "检查完成，历史工具结果已经恢复。",
            },
          ],
        },
      },
    },
    sourceScenarioId: "reasoning-tool-success",
  },
  {
    summary: {
      id: "mock-history-reasoning",
      title: "历史：推理内容",
      group: "Mock History",
      updatedAt: "2026-09-07T11:00:00Z",
    },
    detail: {
      id: "mock-history-reasoning",
      title: "历史：推理内容",
      state: {
        values: {
          messages: [
            {
              id: "reasoning-human-1",
              type: "human",
              content: "为什么历史和实时运行要汇合到同一个 Runtime？",
            },
            {
              id: "reasoning-ai-1",
              type: "ai",
              content: "这样 Thread 的身份、消息与只读策略只有一个权威来源。",
              additional_kwargs: {
                reasoning: {
                  type: "reasoning",
                  reasoning: "比较双 Runtime 同步与单 Runtime hydration 的所有权边界。",
                },
              },
            },
          ],
        },
      },
    },
    sourceScenarioId: "reasoning-tool-success",
  },
  {
    summary: {
      id: "mock-history-frontend-tool",
      title: "历史：已完成前端工具",
      group: "Mock History",
      updatedAt: "2026-09-07T11:30:00Z",
    },
    detail: {
      id: "mock-history-frontend-tool",
      title: "历史：已完成前端工具",
      state: {
        values: {
          messages: [
            {
              id: "frontend-tool-human-1",
              type: "human",
              content: "Please restore the completed frontend tool result.",
            },
            {
              id: "frontend-tool-ai-1",
              type: "ai",
              content: "",
              tool_calls: [{
                id: "history-dangerous-frontend-tool-1",
                name: "dangerous_frontend_tool",
                args: { operation: "delete-artifact", artifactId: "artifact-1" },
              }],
            },
            {
              id: "frontend-tool-result-1",
              type: "tool",
              tool_call_id: "history-dangerous-frontend-tool-1",
              name: "dangerous_frontend_tool",
              status: "success",
              content: "persisted side-effect receipt",
            },
            {
              id: "frontend-tool-ai-2",
              type: "ai",
              content: "The existing result is restored.",
            },
          ],
        },
      },
    },
  },
  {
    summary: {
      id: "mock-history-attachments",
      title: "历史：图片与文件内容",
      group: "Mock History",
      updatedAt: "2026-09-07T11:45:00Z",
    },
    detail: {
      id: "mock-history-attachments",
      title: "历史：图片与文件内容",
      state: {
        values: {
          messages: [
            {
              id: "attachments-human-1",
              type: "human",
              content: [
                { type: "text", text: "请看一下这张图和架构说明。" },
                {
                  type: "image_url",
                  image_url: { url: "https://example.test/architecture.png" },
                },
                {
                  type: "file",
                  source_type: "url",
                  url: "https://example.test/architecture.pdf",
                  mime_type: "application/pdf",
                  metadata: { filename: "architecture.pdf" },
                },
              ],
            },
            {
              id: "attachments-ai-1",
              type: "ai",
              content: "图片和文件保存在 LangGraph 消息内容中。",
            },
          ],
        },
      },
    },
  },
  {
    summary: {
      id: "mock-history-long",
      title: "历史：长会话",
      group: "Mock History",
      updatedAt: "2026-09-07T12:30:00Z",
    },
    detail: {
      id: "mock-history-long",
      title: "历史：长会话",
      state: {
        values: {
          messages: longHistoryMessages(),
          businessState: { source: "mock-langgraph-checkpoint" },
        },
        metadata: { fixture: "long-history" },
      },
    },
  },
];

export const mockConversationList: ConversationListResponse = {
  conversations: mockConversationFixtures.map((fixture) => fixture.summary),
};

export const mockConversationDetails: ConversationDetailResponse[] =
  mockConversationFixtures.map((fixture) => fixture.detail);
