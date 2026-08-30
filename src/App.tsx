import { useCallback, useState } from "react";

import appUIJson from "../app-ui/app-ui.json";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import { pluginDefinitions } from "../plugins";
import { createAgentRuntime, useAgentRuntime } from "../runtime/ag-ui";
import { createPluginRegistry, UIPluginRuntime } from "../runtime/plugins";
import {
  initialPreviewMessages,
  previewAgentState,
} from "./preview-data";

import "./styles.css";

const initialAppUIModel = parseAppUIModel(appUIJson);
const pluginRegistry = createPluginRegistry(pluginDefinitions);
const agentRuntime = createAgentRuntime({
  endpoint: import.meta.env.VITE_AGENT_ENDPOINT,
  mock: {
    initialMessages: initialPreviewMessages,
    initialState: previewAgentState,
  },
});

export function App() {
  const [model, setModel] = useState(initialAppUIModel);
  const agent = useAgentRuntime(agentRuntime);

  const updateInstanceProps = useCallback(
    (instanceId: string, props: Record<string, unknown>) => {
      setModel((current) => {
        const instance = current.pluginInstances[instanceId];

        if (instance === undefined) {
          return current;
        }

        return parseAppUIModel({
          ...current,
          pluginInstances: {
            ...current.pluginInstances,
            [instanceId]: {
              ...instance,
              props: { ...instance.props, ...props },
            },
          },
        });
      });
    },
    [],
  );

  return (
    <main
      className="development-preview"
      data-agent-runtime={agentRuntime.mode}
    >
      <UIPluginRuntime
        actions={{
          sendMessage: (input) => agentRuntime.sendMessage(input),
          updateInstanceProps,
        }}
        messages={agent.messages}
        model={model}
        registry={pluginRegistry}
        state={agent.state}
      />
    </main>
  );
}
