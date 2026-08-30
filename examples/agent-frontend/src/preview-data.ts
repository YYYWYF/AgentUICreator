import type { AGUIMessage } from "../framework/contracts/ui-plugin";

export const initialPreviewMessages: AGUIMessage[] = [
  {
    id: "preview-assistant-1",
    role: "assistant",
    content:
      "你好，我是你的前端智能体。这个界面由 Ant Design X 模板插件通过 AppUIModel 组合而成。",
  },
  {
    id: "preview-user-1",
    role: "user",
    content: "这个界面现在有哪些插件？",
  },
  {
    id: "preview-assistant-2",
    role: "assistant",
    content:
      "当前包含欢迎区、AG-UI 消息流、快捷提示和消息输入四个独立插件。它们共享同一个 Agent Runtime，但不直接持有连接。",
  },
];

export const previewAgentState: unknown = {
  selectedFile: "src/App.tsx",
  files: {
    "src/App.tsx": {
      language: "tsx",
      content: `export function App() {
  return (
    <UIPluginRuntime
      model={model}
      registry={pluginRegistry}
      messages={messages}
      state={agentState}
      actions={actions}
    />
  );
}`,
    },
  },
};
