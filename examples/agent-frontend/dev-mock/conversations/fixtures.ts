import type {
  ConversationDetailResponse,
  ConversationListResponse,
} from "../../services/conversations";

export const mockConversationDetails: ConversationDetailResponse[] = [
  {
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
  {
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
  {
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
];

export const mockConversationList: ConversationListResponse = {
  conversations: [
    {
      id: "conversation-agent-ui",
      title: "分析 Agent UI 架构",
      group: "今天",
      updatedAt: "2026-09-07T10:00:00Z",
    },
    {
      id: "conversation-tool",
      title: "调试 Tool Loading",
      group: "今天",
      updatedAt: "2026-09-07T09:20:00Z",
    },
    {
      id: "conversation-mock",
      title: "设计 Mock Agent",
      group: "昨天",
      updatedAt: "2026-09-06T16:40:00Z",
    },
  ],
};
