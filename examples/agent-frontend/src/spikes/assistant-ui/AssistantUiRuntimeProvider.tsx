import { HttpAgent } from "@ag-ui/client";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import { useMemo, type ReactNode } from "react";

import { resolveAgentEndpoint } from "../../agent-endpoint";

export function AssistantUiRuntimeProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const endpoint = resolveAgentEndpoint({
    configuredEndpoint: import.meta.env.VITE_AGENT_ENDPOINT,
    isDev: import.meta.env.DEV,
    search: window.location.search,
  });

  const agent = useMemo(
    () => {
      if (endpoint === undefined) {
        throw new Error(
          "The assistant-ui Spike requires an AG-UI endpoint.",
        );
      }
      return new HttpAgent({
        url: endpoint,
        headers: { Accept: "text/event-stream" },
      });
    },
    [endpoint],
  );
  const runtime = useAgUiRuntime({ agent, showThinking: true });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
