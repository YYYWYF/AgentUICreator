import type { AgentTransport } from "@agent-ui/runtime-core";

import { createAgUiTransport } from "../src/index.js";

interface AppState {
  selectedFile?: string;
}

export function typedAgUiStateContract(): AgentTransport<AppState> {
  return createAgUiTransport<AppState>({
    endpoint: "https://agent.example.test/ag-ui",
  });
}
