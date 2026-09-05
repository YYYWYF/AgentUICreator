import type { AgentMessage } from "../framework/contracts/ui-plugin";
import type { AppAgentState } from "../agent-contract/agent-state";

export const initialPreviewMessages: AgentMessage[] = [
  {
    id: "preview-assistant-1",
    producer: { type: "root" },
    role: "assistant",
    content:
      "你好，我是你的前端智能体。左侧可以新建和管理会话，右侧会同步展示思考、工具执行和 Agent 产物。",
    metadata: { conversationId: "current" },
  },
  {
    id: "preview-user-1",
    producer: { type: "root" },
    role: "user",
    content: "检查一下这个 Agent 前端目前有哪些插件，并给我一张结构图。",
    metadata: { conversationId: "current" },
  },
  {
    id: "preview-reasoning-1",
    producer: { type: "root" },
    role: "reasoning",
    content:
      "先读取 AppUIModel 与插件注册表，确认布局和实例，再把结果整理成一张可视化结构图。",
    metadata: { conversationId: "current" },
  },
  {
    id: "preview-tool-request-1",
    producer: { type: "root" },
    role: "assistant",
    content: "我会先检查当前插件，再生成结构图。",
    toolCalls: [
      {
        id: "tool-call-list-plugins",
        type: "function",
        function: {
          name: "list_ui_plugins",
          arguments: JSON.stringify({ includeDisabled: false }),
        },
      },
      {
        id: "tool-call-render-diagram",
        type: "function",
        function: {
          name: "render_ui_diagram",
          arguments: JSON.stringify({ format: "mermaid", direction: "LR" }),
        },
      },
    ],
    metadata: { conversationId: "current" },
  },
  {
    id: "preview-tool-result-1",
    producer: { type: "root" },
    role: "tool",
    toolCallId: "tool-call-list-plugins",
    content: JSON.stringify({
      plugins: [
        "antd-x-conversations",
        "antd-x-message-list",
        "antd-x-run-timeline",
        "antd-x-resources",
        "antd-x-sender",
      ],
      runtimeCount: 1,
    }),
    metadata: { conversationId: "current" },
  },
  {
    id: "preview-tool-result-2",
    producer: { type: "root" },
    role: "tool",
    toolCallId: "tool-call-render-diagram",
    content:
      "flowchart LR\n  Runtime[Agent Runtime] --> AGUI[AG-UI]\n  AGUI --> State[Frontend State]\n  State --> Plugins[UI Plugins]\n  Plugins --> AntDX[Ant Design X]",
    metadata: {
      conversationId: "current",
      agentUI: { render: "mermaid" },
    },
  },
  {
    id: "preview-activity-1",
    producer: { type: "root" },
    role: "activity",
    activityType: "ui_analysis",
    content: {
      title: "插件组合检查完成",
      description: "AppUIModel 已挂载 9 个可见插件实例",
      progress: 100,
    },
    metadata: { conversationId: "current" },
  },
  {
    id: "preview-assistant-2",
    producer: { type: "root" },
    role: "assistant",
    content:
      "检查完成：会话管理（含新建会话）、消息、执行链、资源、快捷提示和输入由各自插件提供，共享同一个 AG-UI Runtime。Ant Design X 只负责当前生成项目的 UI 表达。",
    metadata: {
      conversationId: "current",
      sources: [
        {
          key: "antd-x-overview",
          title: "Ant Design X 组件总览",
          url: "https://x.ant.design/components/overview-cn",
          description: "当前组件版本与分类",
        },
      ],
    },
  },
];

export const previewAgentState: AppAgentState = {
  selectedFile: "src/App.tsx",
  files: {
    "src/App.tsx": {
      language: "tsx",
      content: `export function App() {
  return (
    <UIPluginRuntime
      model={model}
      registry={pluginRegistry}
      conversation={conversation}
      executions={executions}
      messages={messages}
      state={agentState}
      run={run}
      actions={actions}
    />
  );
}`,
    },
    "plugins/tool-renderer/index.tsx": {
      language: "tsx",
      content: `export function ToolRenderer({ context }) {
  return <ThoughtChain items={toToolItems(context.messages)} />;
}`,
    },
    "app-ui/app-ui.json": {
      language: "json",
      content: JSON.stringify(
        {
          version: "2",
          layout: "chat + insights",
        },
        null,
        2,
      ),
    },
  },
  attachments: [
    {
      key: "architecture",
      name: "agent-ui-architecture.md",
      byte: 18432,
      description: "Agent 前端结构说明",
    },
    {
      key: "illustration",
      name: "agent-workspace.png",
      byte: 284160,
      description: "最近一次生成的视觉产物",
    },
  ],
  sources: [
    {
      key: "overview",
      title: "Ant Design X 2.9.0 组件总览",
      url: "https://x.ant.design/components/overview-cn",
      description: "17 个官方组件及分类",
    },
    {
      key: "thought-chain",
      title: "ThoughtChain 思维链",
      url: "https://x.ant.design/components/thought-chain-cn",
      description: "Agent Actions 与 Tools 调用链",
    },
  ],
  diagrams: [
    {
      key: "runtime-flow",
      title: "Agent 前端数据流",
      content:
        "flowchart TD\n  Runtime[Agent Runtime] --> AGUI[AG-UI]\n  AGUI --> State[Frontend State]\n  State --> Plugin[UI Plugin]\n  Plugin --> UI[Ant Design X]",
    },
  ],
};
