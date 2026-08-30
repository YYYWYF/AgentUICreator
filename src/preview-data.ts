import type { AGUIMessage } from "../framework/contracts/ui-plugin";

export const initialPreviewMessages: AGUIMessage[] = [
  {
    id: "preview-assistant-1",
    role: "assistant",
    content: "The Plugin Runtime is ready. Send a message to test its action boundary.",
  },
  {
    id: "preview-user-1",
    role: "user",
    content: "Show me the current frontend entry file.",
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
