export const previewAgentState = {
  selectedFile: "src/App.tsx",
  files: {
    "src/App.tsx": {
      language: "tsx",
      content: `export function App() {
  return (
    <AgentRuntimeProvider runtime={agentRuntime}>
      <PluginServiceProvider model={model} registry={pluginRegistry} actions={actions}>
        <UIPluginRuntime
          model={model}
          registry={pluginRegistry}
          actions={actions}
        />
      </PluginServiceProvider>
    </AgentRuntimeProvider>
  );
}`,
    },
    "plugins/tool-renderer/index.tsx": {
      language: "tsx",
      content: `export function ToolRenderer() {
  const { toolCall, result, running } = useToolRenderContext();
  return <ToolBlock call={toolCall} result={result} running={running} />;
}`,
    },
    "app-ui/app-ui.json": {
      language: "json",
      content: JSON.stringify(
        {
          root: {
            type: "slot",
            id: "conversation-surface",
            description: "Primary conversation workspace.",
            plugins: [
              {
                id: "agent-conversation-surface-main",
                pluginId: "conversation-surface",
                enabled: true,
              },
            ],
          },
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
      title: "assistant-ui Conversation Domain",
      url: "https://www.assistant-ui.com/",
      description: "Canonical conversation components and runtime surfaces",
    },
    {
      key: "thought-chain",
      title: "assistant-ui Agent Elements",
      url: "https://www.assistant-ui.com/docs/agentic-ui/overview",
      description: "Agent actions, tools, sources, and reasoning presentation",
    },
  ],
  diagrams: [
    {
      key: "runtime-flow",
      title: "Agent 前端数据流",
      content:
        "flowchart TD\n  Runtime[Agent Runtime] --> AGUI[AG-UI]\n  AGUI --> State[Frontend State]\n  State --> Plugin[UI Plugin]\n  Plugin --> UI[assistant-ui]",
    },
  ],
};
