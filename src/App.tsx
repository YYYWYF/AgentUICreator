import { useCallback, useState } from "react";

import appUIJson from "../app-ui/app-ui.json";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { AGUIMessage } from "../framework/contracts/ui-plugin";
import { pluginDefinitions } from "../plugins";
import { createPluginRegistry, UIPluginRuntime } from "../runtime/plugins";
import {
  initialPreviewMessages,
  previewAgentState,
} from "./preview-data";

import "./styles.css";

const initialAppUIModel = parseAppUIModel(appUIJson);
const pluginRegistry = createPluginRegistry(pluginDefinitions);

export function App() {
  const [model, setModel] = useState(initialAppUIModel);
  const [messages, setMessages] = useState<AGUIMessage[]>(
    initialPreviewMessages,
  );

  const sendMessage = useCallback(async (input: string) => {
    setMessages((current) => [
      ...current,
      {
        id: `preview-user-${crypto.randomUUID()}`,
        role: "user",
        content: input,
      },
    ]);
  }, []);

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
    <main className="development-preview">
      <UIPluginRuntime
        actions={{ sendMessage, updateInstanceProps }}
        messages={messages}
        model={model}
        registry={pluginRegistry}
        state={previewAgentState}
      />
    </main>
  );
}
